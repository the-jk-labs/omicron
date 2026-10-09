package org.omicron.mobile.data.repository

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.respondError
import io.ktor.client.plugins.ClientRequestException
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.test.runTest
import kotlinx.io.IOException
import kotlinx.serialization.json.Json
import org.omicron.mobile.data.cache.CachedPostDetail
import org.omicron.mobile.data.cache.OfflinePostCache
import org.omicron.mobile.data.api.KtorPostsApi
import org.omicron.mobile.data.api.PostAuthorDto
import org.omicron.mobile.data.api.PostDto
import org.omicron.mobile.data.api.PostsApi
import org.omicron.mobile.data.api.TagDto
import org.omicron.mobile.data.api.TimelinePageDto
import org.omicron.mobile.data.api.TimelineScope
import org.omicron.mobile.domain.model.InstanceConfiguration
import org.omicron.mobile.domain.model.OwnPostStatus
import org.omicron.mobile.domain.model.PostAuthor
import org.omicron.mobile.domain.model.PostDetail
import org.omicron.mobile.domain.model.PostTag
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PostsRepositoryTest {
    @Test
    fun preservesOpaqueCursorUnchanged() = runTest {
        val api = FakePostsApi(pages = listOf(TimelinePageDto(items = listOf(postDto()), nextCursor = "opaque-next")))
        val repository = PostsRepository(api, savedInstance = { instance() })

        val page = repository.timeline(TimelineScope.Local, null)
        repository.timeline(TimelineScope.Local, page.nextCursor)

        assertEquals(listOf(TimelineScope.Local to null, TimelineScope.Local to "opaque-next"), api.requests)
        assertEquals("opaque-next", page.nextCursor)
    }

    @Test
    fun resolvesRootRelativeMediaAgainstInstanceOrigin() = runTest {
        val api = FakePostsApi(pages = listOf(TimelinePageDto(items = listOf(postDto()), nextCursor = null)))
        val repository = PostsRepository(api, savedInstance = { instance() })

        val page = repository.timeline(TimelineScope.Global, null)

        val post = page.items.single()
        assertEquals("https://omicron.blog/api/uploads/cover.jpg", post.bannerUrl)
        assertEquals("https://omicron.blog/avatars/alice.jpg", post.author.avatarUrl)
    }

    @Test
    fun leavesAbsoluteMediaUrlsUntouched() = runTest {
        val api =
            FakePostsApi(
                pages =
                    listOf(
                        TimelinePageDto(
                            items = listOf(postDto().copy(bannerUrl = "https://cdn.example.com/cover.jpg")),
                            nextCursor = null,
                        ),
                    ),
            )
        val repository = PostsRepository(api, savedInstance = { instance() })

        val page = repository.timeline(TimelineScope.Global, null)

        assertEquals("https://cdn.example.com/cover.jpg", page.items.single().bannerUrl)
    }

    @Test
    fun requiresASavedInstance() = runTest {
        val repository = PostsRepository(FakePostsApi(), savedInstance = { null })

        assertFailsWith<MissingInstanceException> { repository.timeline(TimelineScope.Global, null) }
    }

    @Test
    fun passesTheMintedTokenToEveryCall() = runTest {
        val api = FakePostsApi(pages = listOf(TimelinePageDto(items = listOf(postDto()), nextCursor = null)))
        val repository = PostsRepository(api, savedInstance = { instance() }, accessToken = { "signed-token" })

        repository.timeline(TimelineScope.Global, null)
        repository.postDetail("post-1")
        repository.relatedPosts("post-1")

        assertEquals(listOf<String?>("signed-token", "signed-token", "signed-token"), api.tokens)
    }

    @Test
    fun staysAnonymousWithoutATokenProvider() = runTest {
        val api = FakePostsApi(pages = listOf(TimelinePageDto(items = listOf(postDto()), nextCursor = null)))
        val repository = PostsRepository(api, savedInstance = { instance() })

        repository.timeline(TimelineScope.Global, null)

        assertEquals(listOf<String?>(null), api.tokens)
    }

    @Test
    fun feedPreservesTheMergedCursorUnchanged() = runTest {
        val api = FakePostsApi(pages = listOf(TimelinePageDto(items = listOf(postDto()), nextCursor = "merged-1")))
        val repository = PostsRepository(api, savedInstance = { instance() }, accessToken = { "signed-token" })

        val page = repository.feed(null)
        repository.feed(page.nextCursor)

        assertEquals(listOf(null, "merged-1"), api.feedRequests)
        assertEquals(listOf("signed-token", "signed-token"), api.feedTokens)
        assertEquals("merged-1", page.nextCursor)
    }

    @Test
    fun feedRequiresASignedInSession() = runTest {
        val api = FakePostsApi()
        val repository = PostsRepository(api, savedInstance = { instance() })

        assertFailsWith<UnauthorizedException> { repository.feed(null) }
        assertEquals(emptyList(), api.feedRequests)
    }

    @Test
    fun invalidatesTheSessionWhenTheServerRejectsTheToken() = runTest {
        var invalidated = false
        val repository =
            PostsRepository(
                api = KtorPostsApi(rejectingClient(HttpStatusCode.Unauthorized)),
                savedInstance = { instance() },
                accessToken = { "stale-token" },
                onUnauthorized = { invalidated = true },
            )

        assertFailsWith<UnauthorizedException> { repository.timeline(TimelineScope.Global, null) }
        assertTrue(invalidated)
    }

    @Test
    fun surfacesOtherClientFailuresUnchanged() = runTest {
        var invalidated = false
        val repository =
            PostsRepository(
                api = KtorPostsApi(rejectingClient(HttpStatusCode.Forbidden)),
                savedInstance = { instance() },
                accessToken = { "signed-token" },
                onUnauthorized = { invalidated = true },
            )

        assertFailsWith<ClientRequestException> { repository.timeline(TimelineScope.Global, null) }
        assertEquals(false, invalidated)
    }

    @Test
    fun mapsPostDetailWithExplicitCoverOnly() = runTest {
        val api =
            FakePostsApi(
                pages =
                    listOf(
                        TimelinePageDto(
                            items =
                                listOf(
                                    postDto().copy(
                                        bannerUrl = "/api/uploads/fallback.jpg",
                                        coverUrl = "/uploads/cover.jpg",
                                    ),
                                ),
                            nextCursor = null,
                        ),
                    ),
            )
        val repository = PostsRepository(api, savedInstance = { instance() })

        val detail = repository.postDetail("post-1")
        val timelinePost = repository.timeline(TimelineScope.Global, null).items.single()

        assertEquals("<p>Hello</p>", detail.contentHtml)
        assertEquals("https://omicron.blog/uploads/cover.jpg", detail.coverUrl)
        assertEquals("A greeting", timelinePost.summary)
        assertEquals("<p>Hello</p>", timelinePost.contentHtml)
    }

    @Test
    fun storesOnlyPublishedDetailsWithoutViewerSpecificState() = runTest {
        val api = FakePostsApi()
        api.postResult = postDto().copy(status = "published", liked = true, recommended = true)
        val cache = MemoryOfflinePostCache()
        val repository = PostsRepository(api, savedInstance = { instance() }, offlinePostCache = cache)

        val detail = repository.postDetail("post-1")

        assertEquals(1, cache.writeCalls)
        assertFalse(cache.cachedPost?.liked ?: true)
        assertFalse(cache.cachedPost?.recommended ?: true)
        assertEquals(OwnPostStatus.Published, detail.status)
        assertFalse(detail.isOfflineCopy)
    }

    @Test
    fun usesCachedPublishedDetailOnlyForTransportFailures() = runTest {
        val api = FakePostsApi(postFailure = IOException("offline"))
        val cache = MemoryOfflinePostCache(CachedPostDetail(postDetail(), cachedAtMillis = 1234L))
        val repository = PostsRepository(api, savedInstance = { instance() }, offlinePostCache = cache)

        val post = repository.postDetail("post-1")

        assertEquals(1, cache.readCalls)
        assertTrue(post.isOfflineCopy)
        assertEquals(1234L, post.cachedAtMillis)
        assertFalse(post.liked)
        assertFalse(post.recommended)
    }

    @Test
    fun doesNotUseCachedContentForAuthorizationFailuresOrCacheDrafts() = runTest {
        val cache = MemoryOfflinePostCache(CachedPostDetail(postDetail(), cachedAtMillis = 1234L))
        val rejectingApi = FakePostsApi(postFailure = UnauthorizedException())
        val rejectingRepository = PostsRepository(rejectingApi, savedInstance = { instance() }, offlinePostCache = cache)

        assertFailsWith<UnauthorizedException> { rejectingRepository.postDetail("post-1") }
        assertEquals(0, cache.readCalls)

        val draftApi = FakePostsApi()
        draftApi.postResult = postDto().copy(status = "draft")
        val draftRepository = PostsRepository(draftApi, savedInstance = { instance() }, offlinePostCache = cache)

        val draft = draftRepository.postDetail("post-1")

        assertEquals(OwnPostStatus.Draft, draft.status)
        assertEquals(0, cache.writeCalls)
    }

    @Test
    fun mapsRelatedPosts() = runTest {
        val api =
            FakePostsApi(
                pages = listOf(TimelinePageDto(items = listOf(postDto().copy(id = "post-2")), nextCursor = null)),
            )
        val repository = PostsRepository(api, savedInstance = { instance() })

        val related = repository.relatedPosts("post-1")

        assertEquals(listOf("post-2"), related.map { it.id })
        assertEquals("https://omicron.blog/api/uploads/cover.jpg", related.single().bannerUrl)
    }

    private fun instance() =
        InstanceConfiguration(
            origin = "https://omicron.blog",
            name = "Omicron",
            domain = "omicron.blog",
            federationEnabled = true,
            setupComplete = true,
            emailEnabled = true,
            emailVerificationRequired = true,
        )

    private fun postDto() =
        PostDto(
            id = "post-1",
            title = "Hello",
            contentHtml = "<p>Hello</p>",
            summary = "A greeting",
            bannerUrl = "/api/uploads/cover.jpg",
            createdAt = "2026-01-01T00:00:00Z",
            author =
                PostAuthorDto(
                    id = "user-1",
                    username = "alice",
                    displayName = "Alice",
                    avatarUrl = "/avatars/alice.jpg",
                ),
            tags = listOf(TagDto("intro", "Intro")),
            likeCount = 3,
            commentCount = 1,
        )

    private fun postDetail() =
        PostDetail(
            id = "post-1",
            title = "Hello",
            contentHtml = "<p>Hello</p>",
            coverUrl = null,
            coverCredit = null,
            language = "en",
            summary = "A greeting",
            status = OwnPostStatus.Published,
            createdAt = "2026-01-01T00:00:00Z",
            author = PostAuthor("user-1", "alice", "Alice", null, remote = false),
            tags = listOf(PostTag("intro", "Intro")),
            likeCount = 1,
            commentCount = 0,
            recommendCount = 0,
            remote = false,
        )
}

private fun rejectingClient(status: HttpStatusCode): HttpClient =
    HttpClient(MockEngine { respondError(status) }) {
        expectSuccess = true
        install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
    }

private class FakePostsApi(
    private val pages: List<TimelinePageDto> = listOf(TimelinePageDto()),
    var postFailure: Throwable? = null,
) : PostsApi {
    val requests = mutableListOf<Pair<TimelineScope, String?>>()
    val tokens = mutableListOf<String?>()
    val feedRequests = mutableListOf<String?>()
    val feedTokens = mutableListOf<String>()
    var postResult: PostDto? = null

    override suspend fun timeline(
        origin: String,
        scope: TimelineScope,
        cursor: String?,
        accessToken: String?,
    ): TimelinePageDto {
        requests += scope to cursor
        tokens += accessToken
        return pages[minOf(requests.size - 1, pages.size - 1)]
    }

    override suspend fun post(
        origin: String,
        id: String,
        accessToken: String?,
    ): PostDto {
        tokens += accessToken
        postFailure?.let { throw it }
        return postResult ?: pages.first().items.single { it.id == id }
    }

    override suspend fun relatedPosts(
        origin: String,
        id: String,
        accessToken: String?,
    ): List<PostDto> {
        tokens += accessToken
        return pages.first().items.filter { it.id != id }
    }

    override suspend fun feed(
        origin: String,
        cursor: String?,
        accessToken: String,
    ): TimelinePageDto {
        feedRequests += cursor
        feedTokens += accessToken
        return pages[minOf(feedRequests.size - 1, pages.size - 1)]
    }
}

private class MemoryOfflinePostCache(
    private var saved: CachedPostDetail? = null,
) : OfflinePostCache {
    var readCalls = 0
    var writeCalls = 0
    var cachedPost: PostDetail? = null

    override suspend fun read(origin: String, postId: String): CachedPostDetail? {
        readCalls += 1
        return saved?.takeIf { it.post.id == postId }
    }

    override suspend fun entries(origin: String): List<CachedPostDetail> = listOfNotNull(saved)

    override suspend fun write(origin: String, post: PostDetail) {
        writeCalls += 1
        cachedPost = post
        saved = CachedPostDetail(post, 1234L)
    }

    override suspend fun remove(origin: String, postId: String) {
        if (saved?.post?.id == postId) saved = null
    }

    override suspend fun clear(origin: String) {
        saved = null
    }
}

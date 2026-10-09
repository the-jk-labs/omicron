package org.omicron.mobile.data.repository

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respondError
import io.ktor.client.plugins.ClientRequestException
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.omicron.mobile.data.api.AuthoringApi
import org.omicron.mobile.data.api.BarePostDto
import org.omicron.mobile.data.api.CreatePostRequest
import org.omicron.mobile.data.api.KtorAuthoringApi
import org.omicron.mobile.data.api.OwnCountsDto
import org.omicron.mobile.data.api.PostAuthorDto
import org.omicron.mobile.data.api.PostDto
import org.omicron.mobile.data.api.TimelinePageDto
import org.omicron.mobile.data.api.UpdatePostRequest
import org.omicron.mobile.data.api.UploadResponseDto
import org.omicron.mobile.domain.model.CreatePostInput
import org.omicron.mobile.domain.model.InstanceConfiguration
import org.omicron.mobile.domain.model.OwnPostStatus
import org.omicron.mobile.domain.model.UpdatePostInput
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AuthoringRepositoryTest {
    @Test
    fun missingInstanceThrowsBeforeNetwork() = runTest {
        val api = RecordingAuthoringApi()
        val repository = AuthoringRepository(api, savedInstance = { null }, accessToken = { "signed-token" })

        val failure = runCatching { repository.createPost(CreatePostInput(contentHtml = "<p>Hello</p>")) }.exceptionOrNull()

        assertIs<MissingInstanceException>(failure)
        assertEquals(0, api.createCalls)
    }

    @Test
    fun signedOutThrowsUnauthorizedBeforeNetwork() = runTest {
        val api = RecordingAuthoringApi()
        val repository = AuthoringRepository(api, savedInstance = { instance() })

        assertFailsWith<UnauthorizedException> { repository.drafts(null) }
        assertFailsWith<UnauthorizedException> { repository.uploadImage(byteArrayOf(1), "image/png") }
        assertEquals(0, api.draftCalls)
        assertEquals(0, api.uploadCalls)
    }

    @Test
    fun createTrimsTitleAndResolvesCover() = runTest {
        val api = RecordingAuthoringApi()
        val repository = AuthoringRepository(api, savedInstance = { instance() }, accessToken = { "signed-token" })

        val post =
            repository.createPost(
                CreatePostInput(
                    title = "  Hello  ",
                    contentHtml = "<p>Hello</p>",
                    status = OwnPostStatus.Draft,
                    coverUrl = "/uploads/banner.png",
                ),
            )

        assertEquals("Hello", api.lastCreate?.title)
        assertEquals("draft", api.lastCreate?.status)
        assertEquals("https://omicron.blog/uploads/banner.png", post.coverUrl)
        assertEquals(OwnPostStatus.Draft, post.status)
    }

    @Test
    fun blankTitleIsOmitted() = runTest {
        val api = RecordingAuthoringApi()
        val repository = AuthoringRepository(api, savedInstance = { instance() }, accessToken = { "signed-token" })

        repository.createPost(CreatePostInput(title = "   ", contentHtml = "<p>Hello</p>"))

        assertNull(api.lastCreate?.title)
    }

    @Test
    fun updateSendsOnlyChangedFields() = runTest {
        val api = RecordingAuthoringApi()
        val repository = AuthoringRepository(api, savedInstance = { instance() }, accessToken = { "signed-token" })

        repository.updatePost("post-1", UpdatePostInput(tags = listOf("technology")))

        assertEquals("post-1", api.lastUpdateId)
        assertEquals(listOf("technology"), api.lastUpdate?.tags)
        assertNull(api.lastUpdate?.title)
        assertNull(api.lastUpdate?.contentHtml)
        assertNull(api.lastUpdate?.status)
    }

    @Test
    fun ownPostsSendsStatusWireValueAndPreservesCursor() = runTest {
        val api = RecordingAuthoringApi(nextCursor = "opaque-next")
        val repository = AuthoringRepository(api, savedInstance = { instance() }, accessToken = { "signed-token" })

        val page = repository.ownPosts(OwnPostStatus.Scheduled, "opaque-cursor-1")

        assertEquals("scheduled", api.mineRequests.single().first)
        assertEquals("opaque-cursor-1", api.mineRequests.single().second)
        assertEquals("opaque-next", page.nextCursor)
    }

    @Test
    fun ownPostsMapsManagementFields() = runTest {
        val api = RecordingAuthoringApi()
        api.mineItems =
            listOf(
                PostDto(
                    id = "scheduled-1",
                    title = "Queued",
                    status = "scheduled",
                    publishAt = "2026-12-01T09:00:00Z",
                    summary = " A short summary ",
                    coverUrl = "/uploads/cover.jpg",
                    createdAt = "2026-01-01T00:00:00Z",
                    updatedAt = "2026-02-01T00:00:00Z",
                    author = PostAuthorDto("user-1", "alice", "Alice"),
                ),
            )
        val repository = AuthoringRepository(api, savedInstance = { instance() }, accessToken = { "signed-token" })

        val post = repository.ownPosts(OwnPostStatus.Scheduled, null).items.single()

        assertEquals("scheduled-1", post.id)
        assertEquals(OwnPostStatus.Scheduled, post.status)
        assertEquals("2026-12-01T09:00:00Z", post.publishAt)
        assertEquals("A short summary", post.summary)
        assertEquals("https://omicron.blog/uploads/cover.jpg", post.coverUrl)
        assertEquals("2026-02-01T00:00:00Z", post.updatedAt)
    }

    @Test
    fun draftsResolveMediaUrls() = runTest {
        val api = RecordingAuthoringApi()
        val repository = AuthoringRepository(api, savedInstance = { instance() }, accessToken = { "signed-token" })

        val page = repository.drafts(null)

        assertEquals(1, api.draftCalls)
        assertEquals("https://omicron.blog/uploads/cover.jpg", page.items.first().bannerUrl)
    }

    @Test
    fun ownCountsMapsTabBadges() = runTest {
        val api = RecordingAuthoringApi()
        val repository = AuthoringRepository(api, savedInstance = { instance() }, accessToken = { "signed-token" })

        val counts = repository.ownCounts()

        assertEquals(2, counts.draft)
        assertEquals(1, counts.scheduled)
        assertEquals(5, counts.published)
    }

    @Test
    fun uploadResolvesMediaUrl() = runTest {
        val api = RecordingAuthoringApi()
        val repository = AuthoringRepository(api, savedInstance = { instance() }, accessToken = { "signed-token" })

        val image = repository.uploadImage(byteArrayOf(1, 2, 3), "image/png")

        assertEquals("image/png", api.lastUploadType)
        assertContentEquals(byteArrayOf(1, 2, 3), api.lastUploadBytes)
        assertEquals("https://omicron.blog/api/uploads/photo-1.png", image.url)
    }

    @Test
    fun invalidatesTheSessionWhenTheServerRejectsTheToken() = runTest {
        var invalidated = false
        val repository =
            AuthoringRepository(
                api = KtorAuthoringApi(rejectingClient(HttpStatusCode.Unauthorized)),
                savedInstance = { instance() },
                accessToken = { "stale-token" },
                onUnauthorized = { invalidated = true },
            )

        assertFailsWith<UnauthorizedException> { repository.ownCounts() }
        assertTrue(invalidated)
    }

    @Test
    fun surfacesOtherClientFailuresUnchanged() = runTest {
        var invalidated = false
        val repository =
            AuthoringRepository(
                api = KtorAuthoringApi(rejectingClient(HttpStatusCode.Forbidden)),
                savedInstance = { instance() },
                accessToken = { "signed-token" },
                onUnauthorized = { invalidated = true },
            )

        assertFailsWith<ClientRequestException> { repository.ownCounts() }
        assertEquals(false, invalidated)
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

    private fun rejectingClient(status: HttpStatusCode): HttpClient =
        HttpClient(MockEngine { respondError(status) }) {
            expectSuccess = true
            install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
        }

    private class RecordingAuthoringApi(
        private val nextCursor: String? = null,
    ) : AuthoringApi {
        var createCalls = 0
        var draftCalls = 0
        var uploadCalls = 0
        var lastCreate: CreatePostRequest? = null
        var lastUpdateId: String? = null
        var lastUpdate: UpdatePostRequest? = null
        var lastUploadBytes = byteArrayOf()
        var lastUploadType: String? = null
        var mineItems: List<PostDto> = emptyList()
        val mineRequests = mutableListOf<Pair<String, String?>>()

        override suspend fun createPost(origin: String, request: CreatePostRequest, accessToken: String): BarePostDto {
            createCalls += 1
            lastCreate = request
            return BarePostDto(
                id = "post-1",
                title = "Hello",
                slug = "hello",
                status = "draft",
                coverUrl = "/uploads/banner.png",
                createdAt = "2026-01-01T00:00:00Z",
            )
        }

        override suspend fun updatePost(origin: String, id: String, request: UpdatePostRequest, accessToken: String): BarePostDto {
            lastUpdateId = id
            lastUpdate = request
            return BarePostDto(id = id, title = "Hello", slug = "hello", status = "draft", createdAt = "2026-01-01T00:00:00Z")
        }

        override suspend fun deletePost(origin: String, id: String, notify: Boolean, accessToken: String) = Unit

        override suspend fun drafts(origin: String, cursor: String?, accessToken: String): TimelinePageDto {
            draftCalls += 1
            return TimelinePageDto(
                items =
                    listOf(
                        PostDto(
                            id = "post-1",
                            title = "Hello",
                            contentHtml = "<p>Hello</p>",
                            bannerUrl = "/uploads/cover.jpg",
                            createdAt = "2026-01-01T00:00:00Z",
                            author = PostAuthorDto("user-1", "alice", "Alice"),
                        ),
                    ),
                nextCursor = nextCursor,
            )
        }

        override suspend fun ownPosts(origin: String, status: String, cursor: String?, accessToken: String): TimelinePageDto {
            mineRequests += status to cursor
            return TimelinePageDto(mineItems, nextCursor)
        }

        override suspend fun ownCounts(origin: String, accessToken: String): OwnCountsDto =
            OwnCountsDto(draft = 2, scheduled = 1, published = 5)

        override suspend fun uploadImage(origin: String, bytes: ByteArray, contentType: String, accessToken: String): UploadResponseDto {
            uploadCalls += 1
            lastUploadBytes = bytes
            lastUploadType = contentType
            return UploadResponseDto(url = "/api/uploads/photo-1.png")
        }
    }
}

package org.omicron.mobile.data.repository

import kotlinx.coroutines.test.runTest
import org.omicron.mobile.data.api.PostAuthorDto
import org.omicron.mobile.data.api.PostDto
import org.omicron.mobile.data.api.PostsApi
import org.omicron.mobile.data.api.TagDto
import org.omicron.mobile.data.api.TimelinePageDto
import org.omicron.mobile.data.api.TimelineScope
import org.omicron.mobile.domain.model.InstanceConfiguration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

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
}

private class FakePostsApi(
    private val pages: List<TimelinePageDto> = listOf(TimelinePageDto()),
) : PostsApi {
    val requests = mutableListOf<Pair<TimelineScope, String?>>()

    override suspend fun timeline(
        origin: String,
        scope: TimelineScope,
        cursor: String?,
    ): TimelinePageDto {
        requests += scope to cursor
        return pages[minOf(requests.size - 1, pages.size - 1)]
    }

    override suspend fun post(
        origin: String,
        id: String,
    ): PostDto = pages.first().items.single { it.id == id }

    override suspend fun relatedPosts(
        origin: String,
        id: String,
    ): List<PostDto> = pages.first().items.filter { it.id != id }
}

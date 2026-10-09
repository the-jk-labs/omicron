package org.omicron.mobile.feature.offline

import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.omicron.mobile.data.api.PostAuthorDto
import org.omicron.mobile.data.api.PostDto
import org.omicron.mobile.data.api.PostsApi
import org.omicron.mobile.data.api.TimelinePageDto
import org.omicron.mobile.data.api.TimelineScope
import org.omicron.mobile.data.cache.CachedPostDetail
import org.omicron.mobile.data.cache.OfflinePostCache
import org.omicron.mobile.data.repository.PostsRepository
import org.omicron.mobile.domain.model.InstanceConfiguration
import org.omicron.mobile.domain.model.OwnPostStatus
import org.omicron.mobile.domain.model.PostAuthor
import org.omicron.mobile.domain.model.PostDetail
import org.omicron.mobile.domain.model.PostTag
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class OfflineReadingViewModelTest {
    @Test
    fun listsCachedArticlesForTheCurrentInstance() = runTest {
        val cache = MemoryOfflinePostCache(mutableListOf(CachedPostDetail(post(), 1_234L)))
        val viewModel = offlineViewModel(cache)
        testScheduler.advanceUntilIdle()

        assertIs<OfflineReadingPhase.Content>(viewModel.uiState.value.phase)
        assertEquals("post-1", viewModel.uiState.value.posts.single().id)
        assertEquals("Article", viewModel.uiState.value.posts.single().title)
        assertEquals(1_234L, viewModel.uiState.value.posts.single().cachedAtMillis)
    }

    @Test
    fun removingAndClearingCachedArticlesRefreshesTheList() = runTest {
        val cache =
            MemoryOfflinePostCache(
                mutableListOf(
                    CachedPostDetail(post("post-1"), 1L),
                    CachedPostDetail(post("post-2"), 2L),
                ),
            )
        val viewModel = offlineViewModel(cache)
        testScheduler.advanceUntilIdle()

        viewModel.remove("post-1")
        testScheduler.advanceUntilIdle()
        assertEquals(listOf("post-2"), viewModel.uiState.value.posts.map { it.id })

        viewModel.clear()
        testScheduler.advanceUntilIdle()
        assertTrue(viewModel.uiState.value.posts.isEmpty())
    }

    private fun TestScope.offlineViewModel(cache: OfflinePostCache): OfflineReadingViewModel {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val posts =
            PostsRepository(
                api = EmptyPostsApi(),
                savedInstance = { instance() },
                offlinePostCache = cache,
            )
        return OfflineReadingViewModel(posts, TestScope(dispatcher))
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

    private fun post(id: String = "post-1") =
        PostDetail(
            id = id,
            title = "Article",
            contentHtml = "<p>Body</p>",
            coverUrl = null,
            coverCredit = null,
            language = "en",
            summary = null,
            status = OwnPostStatus.Published,
            createdAt = "2026-01-01T00:00:00Z",
            author = PostAuthor("user-1", "alice", "Alice", null, false),
            tags = listOf(PostTag("intro", "Intro")),
            likeCount = 0,
            commentCount = 0,
            recommendCount = 0,
            remote = false,
        )

    private class MemoryOfflinePostCache(
        private val entries: MutableList<CachedPostDetail>,
    ) : OfflinePostCache {
        override suspend fun read(origin: String, postId: String): CachedPostDetail? =
            entries.firstOrNull { it.post.id == postId }

        override suspend fun entries(origin: String): List<CachedPostDetail> = entries.toList()

        override suspend fun write(origin: String, post: PostDetail) {
            entries.removeAll { it.post.id == post.id }
            entries += CachedPostDetail(post, 0L)
        }

        override suspend fun remove(origin: String, postId: String) {
            entries.removeAll { it.post.id == postId }
        }

        override suspend fun clear(origin: String) {
            entries.clear()
        }
    }

    private class EmptyPostsApi : PostsApi {
        override suspend fun timeline(origin: String, scope: TimelineScope, cursor: String?, accessToken: String?) = TimelinePageDto()

        override suspend fun feed(origin: String, cursor: String?, accessToken: String) = TimelinePageDto()

        override suspend fun post(origin: String, id: String, accessToken: String?): PostDto =
            PostDto(
                id = id,
                createdAt = "2026-01-01T00:00:00Z",
                author = PostAuthorDto("user-1", "alice", "Alice"),
            )

        override suspend fun relatedPosts(origin: String, id: String, accessToken: String?) = emptyList<PostDto>()
    }
}

package org.omicron.mobile.feature.offline

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.omicron.mobile.core.designsystem.OmicronTheme
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

@RunWith(AndroidJUnit4::class)
class OfflineReadingJourneyTest {
    @get:Rule
    val composeTestRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun savedArticleCanBeOpenedAndRemoved() {
        val cache = JourneyOfflinePostCache()
        val viewModel = offlineViewModel(cache)
        var openedPostId: String? = null
        composeTestRule.setContent {
            OmicronTheme {
                OfflineReadingRoute(viewModel, onBack = {}, onOpenPost = { openedPostId = it })
            }
        }

        composeTestRule.waitForText("Offline article")
        composeTestRule.onNodeWithText("Read").performClick()
        assertEquals("post-1", openedPostId)
        composeTestRule.onNodeWithText("Remove").performClick()
        composeTestRule.waitForText("No saved articles")
        viewModel.close()
    }

    private fun offlineViewModel(cache: OfflinePostCache) =
        OfflineReadingViewModel(
            PostsRepository(
                api = EmptyPostsApi(),
                savedInstance = { instance() },
                offlinePostCache = cache,
            ),
        )

    private fun ComposeTestRule.waitForText(text: String) {
        waitUntil(timeoutMillis = 5_000) {
            onAllNodesWithText(text, substring = true).fetchSemanticsNodes().isNotEmpty()
        }
    }
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

private class JourneyOfflinePostCache : OfflinePostCache {
    private val cached = mutableListOf(CachedPostDetail(offlineArticle(), 1_000L))

    override suspend fun read(origin: String, postId: String): CachedPostDetail? = cached.firstOrNull { it.post.id == postId }

    override suspend fun entries(origin: String): List<CachedPostDetail> = cached.toList()

    override suspend fun write(origin: String, post: PostDetail) {
        cached.removeAll { it.post.id == post.id }
        cached += CachedPostDetail(post, 1_000L)
    }

    override suspend fun remove(origin: String, postId: String) {
        cached.removeAll { it.post.id == postId }
    }

    override suspend fun clear(origin: String) {
        cached.clear()
    }
}

private fun offlineArticle() =
    PostDetail(
        id = "post-1",
        title = "Offline article",
        contentHtml = "<p>Saved for reading.</p>",
        coverUrl = null,
        coverCredit = null,
        language = "en",
        summary = null,
        status = OwnPostStatus.Published,
        createdAt = "2026-01-01T00:00:00Z",
        author = PostAuthor("user-1", "alice", "Alice", null, remote = false),
        tags = listOf(PostTag("intro", "Intro")),
        likeCount = 0,
        commentCount = 0,
        recommendCount = 0,
        remote = false,
    )

private class EmptyPostsApi : PostsApi {
    override suspend fun timeline(origin: String, scope: TimelineScope, cursor: String?, accessToken: String?) = TimelinePageDto()

    override suspend fun feed(origin: String, cursor: String?, accessToken: String) = TimelinePageDto()

    override suspend fun post(origin: String, id: String, accessToken: String?): PostDto =
        PostDto(
            id = id,
            createdAt = "2026-01-01T00:00:00Z",
            author = PostAuthorDto("user-1", "alice", "Alice"),
        )

    override suspend fun relatedPosts(origin: String, id: String, accessToken: String?): List<PostDto> = emptyList()
}

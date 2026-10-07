package org.omicron.mobile.feature.reader

import kotlinx.io.IOException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.omicron.mobile.data.api.PostDto
import org.omicron.mobile.data.api.PostsApi
import org.omicron.mobile.data.api.TimelinePageDto
import org.omicron.mobile.data.api.TimelineScope
import org.omicron.mobile.data.repository.MissingInstanceException
import org.omicron.mobile.data.repository.PostsRepository
import org.omicron.mobile.domain.model.AuthenticatedSession
import org.omicron.mobile.domain.model.AuthenticatedUser
import org.omicron.mobile.domain.model.InstanceConfiguration
import org.omicron.mobile.domain.model.Post
import org.omicron.mobile.domain.model.PostAuthor
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class TimelineViewModelTest {
    @Test
    fun loadsGlobalTimelineOnStart() = runTest {
        val viewModel = timelineViewModel(posts = listOf(post("post-1"), post("post-2")), nextCursor = "opaque-next")
        testScheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertIs<TimelinePhase.Content>(state.phase)
        assertEquals(2, state.posts.size)
        assertEquals("opaque-next", state.nextCursor)
    }

    @Test
    fun showsEmptyWhenTimelineHasNoPosts() = runTest {
        val viewModel = timelineViewModel(posts = emptyList())
        testScheduler.advanceUntilIdle()

        assertIs<TimelinePhase.Empty>(viewModel.uiState.value.phase)
    }

    @Test
    fun mapsNetworkFailuresToOffline() = runTest {
        val viewModel = timelineViewModel(failure = IOException("unresolved"))
        testScheduler.advanceUntilIdle()

        assertEquals(
            TimelinePhase.Error(TimelineError.Offline),
            viewModel.uiState.value.phase,
        )
    }

    @Test
    fun mapsMissingInstance() = runTest {
        val repository = PostsRepository(FailingPostsApi(MissingInstanceException()), savedInstance = { null })
        val dispatcher = StandardTestDispatcher(testScheduler)
        val viewModel = TimelineViewModel(repository, TestScope(dispatcher))
        testScheduler.advanceUntilIdle()

        assertEquals(
            TimelinePhase.Error(TimelineError.MissingInstance),
            viewModel.uiState.value.phase,
        )
    }

    @Test
    fun loadMoreAppendsPostsAndPreservesCursor() = runTest {
        val api = SequencedPostsApi(pages = listOf(page(listOf(post("post-1")), "cursor-1"), page(emptyList(), null)))
        val dispatcher = StandardTestDispatcher(testScheduler)
        val viewModel = TimelineViewModel(PostsRepository(api, savedInstance = { instance() }), TestScope(dispatcher))
        testScheduler.advanceUntilIdle()

        viewModel.loadMore()
        testScheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(listOf("post-1"), state.posts.map(Post::id))
        assertNull(state.nextCursor)
        assertEquals(listOf(null, "cursor-1"), api.cursors)
    }

    @Test
    fun switchingScopeReloadsTimeline() = runTest {
        val api = SequencedPostsApi(pages = listOf(page(listOf(post("post-1")), null), page(listOf(post("post-2")), null)))
        val dispatcher = StandardTestDispatcher(testScheduler)
        val viewModel = TimelineViewModel(PostsRepository(api, savedInstance = { instance() }), TestScope(dispatcher))
        testScheduler.advanceUntilIdle()

        viewModel.selectScope(TimelineScope.Local)
        testScheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(TimelineScope.Local, state.scope)
        assertEquals(listOf("post-2"), state.posts.map(Post::id))
        assertEquals(listOf(TimelineScope.Global, TimelineScope.Local), api.scopes)
    }

    @Test
    fun retryRecoversFromError() = runTest {
        val api = SequencedPostsApi(pages = listOf(page(listOf(post("post-1")), null)), failFirst = true)
        val dispatcher = StandardTestDispatcher(testScheduler)
        val viewModel = TimelineViewModel(PostsRepository(api, savedInstance = { instance() }), TestScope(dispatcher))
        testScheduler.advanceUntilIdle()
        assertIs<TimelinePhase.Error>(viewModel.uiState.value.phase)

        viewModel.retry()
        testScheduler.advanceUntilIdle()

        assertIs<TimelinePhase.Content>(viewModel.uiState.value.phase)
        assertEquals(listOf("post-1"), viewModel.uiState.value.posts.map(Post::id))
    }

    @Test
    fun staysOnGlobalWithoutASession() = runTest {
        val viewModel = timelineViewModel(posts = listOf(post("post-1")))
        testScheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(TimelineScope.Global, state.scope)
        assertFalse(state.signedIn)
        assertEquals(listOf("post-1"), state.posts.map(Post::id))
    }

    @Test
    fun loadsForYouByDefaultWhenSignedIn() = runTest {
        val api = SequencedPostsApi(feedPages = listOf(page(listOf(post("feed-1")), "merged-1")))
        val viewModel = signedTimelineViewModel(api, MutableStateFlow(signedSession()))
        testScheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(TimelineScope.ForYou, state.scope)
        assertTrue(state.signedIn)
        assertEquals(listOf("feed-1"), state.posts.map(Post::id))
        assertEquals(listOf<String?>(null), api.feedCursors)
    }

    @Test
    fun preservesTheMergedFeedCursorAndDedupesRepeats() = runTest {
        val api =
            SequencedPostsApi(
                feedPages =
                    listOf(
                        page(listOf(post("feed-1")), "merged-1"),
                        page(listOf(post("feed-1"), post("feed-2")), null),
                    ),
            )
        val viewModel = signedTimelineViewModel(api, MutableStateFlow(signedSession()))
        testScheduler.advanceUntilIdle()

        viewModel.loadMore()
        testScheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(listOf("feed-1", "feed-2"), state.posts.map(Post::id))
        assertEquals(listOf(null, "merged-1"), api.feedCursors)
    }

    @Test
    fun switchesToForYouWhenSignInArrives() = runTest {
        val api =
            SequencedPostsApi(
                pages = listOf(page(listOf(post("global-1")), null)),
                feedPages = listOf(page(listOf(post("feed-1")), null)),
            )
        val sessions = MutableStateFlow<AuthenticatedSession?>(null)
        val viewModel = signedTimelineViewModel(api, sessions)
        testScheduler.advanceUntilIdle()
        assertEquals(TimelineScope.Global, viewModel.uiState.value.scope)

        sessions.value = signedSession()
        testScheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(TimelineScope.ForYou, state.scope)
        assertEquals(listOf("feed-1"), state.posts.map(Post::id))
    }

    @Test
    fun keepsAManuallySelectedScopeWhenSignInArrives() = runTest {
        val api =
            SequencedPostsApi(
                pages = listOf(page(listOf(post("global-1")), null), page(listOf(post("local-1")), null)),
                feedPages = listOf(page(listOf(post("feed-1")), null)),
            )
        val sessions = MutableStateFlow<AuthenticatedSession?>(null)
        val viewModel = signedTimelineViewModel(api, sessions)
        testScheduler.advanceUntilIdle()

        viewModel.selectScope(TimelineScope.Local)
        testScheduler.advanceUntilIdle()
        sessions.value = signedSession()
        testScheduler.advanceUntilIdle()

        assertEquals(TimelineScope.Local, viewModel.uiState.value.scope)
    }

    @Test
    fun fallsBackToGlobalWhenTheSessionEndsOnForYou() = runTest {
        val api =
            SequencedPostsApi(
                pages = listOf(page(listOf(post("global-1")), null)),
                feedPages = listOf(page(listOf(post("feed-1")), null)),
            )
        val sessions = MutableStateFlow<AuthenticatedSession?>(signedSession())
        val expiration = MutableStateFlow(false)
        val viewModel = signedTimelineViewModel(api, sessions, expiration)
        testScheduler.advanceUntilIdle()
        assertEquals(TimelineScope.ForYou, viewModel.uiState.value.scope)

        sessions.value = null
        expiration.value = true
        testScheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(TimelineScope.Global, state.scope)
        assertFalse(state.signedIn)
        assertTrue(state.sessionExpired)
        assertEquals(listOf("global-1"), state.posts.map(Post::id))
    }

    @Test
    fun explicitSignOutDoesNotLookLikeSessionExpiry() = runTest {
        val api = SequencedPostsApi(feedPages = listOf(page(listOf(post("feed-1")), null)))
        val sessions = MutableStateFlow<AuthenticatedSession?>(signedSession())
        val expiration = MutableStateFlow(false)
        val viewModel = signedTimelineViewModel(api, sessions, expiration)
        testScheduler.advanceUntilIdle()

        sessions.value = null
        testScheduler.advanceUntilIdle()

        assertFalse(viewModel.uiState.value.sessionExpired)
    }
}

private fun TestScope.timelineViewModel(
    posts: List<Post> = emptyList(),
    nextCursor: String? = null,
    failure: Throwable? = null,
): TimelineViewModel {
    val api = if (failure == null) SequencedPostsApi(pages = listOf(page(posts, nextCursor))) else FailingPostsApi(failure)
    val dispatcher = StandardTestDispatcher(testScheduler)
    return TimelineViewModel(PostsRepository(api, savedInstance = { instance() }), TestScope(dispatcher))
}

private fun TestScope.signedTimelineViewModel(
    api: PostsApi,
    sessions: MutableStateFlow<AuthenticatedSession?>,
    sessionExpired: MutableStateFlow<Boolean>? = null,
): TimelineViewModel {
    val dispatcher = StandardTestDispatcher(testScheduler)
    val repository = PostsRepository(api, savedInstance = { instance() }, accessToken = { "signed-token" })
    return TimelineViewModel(repository, TestScope(dispatcher), sessions, sessionExpired)
}

private fun signedSession() =
    AuthenticatedSession(
        AuthenticatedUser("user-1", "ada@example.com", "ada", "Ada"),
        "signed-token",
    )

private fun page(
    posts: List<Post>,
    nextCursor: String?,
): TimelinePageDto =
    TimelinePageDto(
        items =
            posts.map {
                PostDto(
                    id = it.id,
                    title = "Title ${it.id}",
                    contentHtml = "<p>Body</p>",
                    createdAt = "2026-01-01T00:00:00Z",
                    author = org.omicron.mobile.data.api.PostAuthorDto("user-1", "alice", "Alice"),
                )
            },
        nextCursor = nextCursor,
    )

private fun post(id: String) =
    Post(
        id = id,
        title = "Title $id",
        summary = null,
        bannerUrl = null,
        createdAt = "2026-01-01T00:00:00Z",
        author = PostAuthor("user-1", "alice", "Alice", null, false),
        tags = emptyList(),
        likeCount = 0,
        commentCount = 0,
        recommendCount = 0,
        remote = false,
    )

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

private class SequencedPostsApi(
    private val pages: List<TimelinePageDto> = listOf(TimelinePageDto()),
    private val failFirst: Boolean = false,
    private val feedPages: List<TimelinePageDto>? = null,
) : PostsApi {
    val scopes = mutableListOf<TimelineScope>()
    val cursors = mutableListOf<String?>()
    val feedCursors = mutableListOf<String?>()
    private var calls = 0

    override suspend fun timeline(
        origin: String,
        scope: TimelineScope,
        cursor: String?,
        accessToken: String?,
    ): TimelinePageDto {
        scopes += scope
        cursors += cursor
        calls += 1
        if (failFirst && calls == 1) throw IOException("unresolved")
        return pages[minOf(calls - 1, pages.size - 1)]
    }

    override suspend fun post(
        origin: String,
        id: String,
        accessToken: String?,
    ): PostDto = throw UnsupportedOperationException()

    override suspend fun relatedPosts(
        origin: String,
        id: String,
        accessToken: String?,
    ): List<PostDto> = emptyList()

    override suspend fun feed(
        origin: String,
        cursor: String?,
        accessToken: String,
    ): TimelinePageDto {
        feedCursors += cursor
        return (feedPages ?: pages)[minOf(feedCursors.size - 1, (feedPages ?: pages).size - 1)]
    }
}

private class FailingPostsApi(
    private val failure: Throwable,
) : PostsApi {
    override suspend fun timeline(
        origin: String,
        scope: TimelineScope,
        cursor: String?,
        accessToken: String?,
    ): TimelinePageDto = throw failure

    override suspend fun post(
        origin: String,
        id: String,
        accessToken: String?,
    ): PostDto = throw failure

    override suspend fun relatedPosts(
        origin: String,
        id: String,
        accessToken: String?,
    ): List<PostDto> = throw failure

    override suspend fun feed(
        origin: String,
        cursor: String?,
        accessToken: String,
    ): TimelinePageDto = throw failure
}

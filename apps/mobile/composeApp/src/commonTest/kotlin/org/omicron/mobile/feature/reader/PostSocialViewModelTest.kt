package org.omicron.mobile.feature.reader

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.io.IOException
import org.omicron.mobile.data.api.FakeSocialApi
import org.omicron.mobile.data.repository.SocialRepository
import org.omicron.mobile.domain.model.AuthenticatedSession
import org.omicron.mobile.domain.model.AuthenticatedUser
import org.omicron.mobile.domain.model.PostAuthor
import org.omicron.mobile.domain.model.PostDetail
import org.omicron.mobile.domain.model.InstanceConfiguration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PostSocialViewModelTest {
    @Test
    fun likeRollsBackWhenTheMutationFails() = runTest {
        val api = FakeSocialApi().apply { postLikeFailure = IOException("offline") }
        val sessions = MutableStateFlow<AuthenticatedSession?>(session())
        val viewModel = socialViewModel(api, sessions)
        viewModel.bind(post())
        testScheduler.advanceUntilIdle()

        viewModel.toggleLike()
        assertTrue(viewModel.uiState.value.post!!.liked)
        assertEquals(5, viewModel.uiState.value.post!!.likeCount)
        testScheduler.advanceUntilIdle()

        assertFalse(viewModel.uiState.value.post!!.liked)
        assertEquals(4, viewModel.uiState.value.post!!.likeCount)
        assertEquals(SocialActionError.Request, viewModel.uiState.value.likeError)
    }

    @Test
    fun commentsLoadWithTheirOpaqueCursorAndSubmittingAddsTheResponse() = runTest {
        val api = FakeSocialApi().apply {
            commentPage = org.omicron.mobile.data.api.CommentPageDto(
                items = listOf(org.omicron.mobile.data.api.comment()),
                nextCursor = "opaque-comments-cursor",
            )
        }
        val viewModel = socialViewModel(api, MutableStateFlow<AuthenticatedSession?>(session()))
        viewModel.bind(post())
        testScheduler.advanceUntilIdle()
        assertEquals("opaque-comments-cursor", viewModel.uiState.value.nextCommentCursor)
        assertEquals(listOf<String?>(null), api.requestedCursors)

        viewModel.updateDraft("A new response")
        viewModel.submitComment()
        assertEquals(2, viewModel.uiState.value.post?.commentCount)
        testScheduler.advanceUntilIdle()

        assertEquals(listOf("comment-created", "comment-1"), viewModel.uiState.value.comments.map { it.id })
        assertEquals("A new response", viewModel.uiState.value.comments.first().content)
        assertEquals(2, viewModel.uiState.value.post?.commentCount)
    }

    @Test
    fun failedCommentSubmissionRemovesTheOptimisticItemAndRestoresDraft() = runTest {
        val api = FakeSocialApi().apply { commentFailure = IOException("offline") }
        val viewModel = socialViewModel(api, MutableStateFlow<AuthenticatedSession?>(session()))
        viewModel.bind(post())
        testScheduler.advanceUntilIdle()

        viewModel.updateDraft("Keep this response")
        viewModel.submitComment()
        assertEquals(2, viewModel.uiState.value.post?.commentCount)
        testScheduler.advanceUntilIdle()

        assertEquals(1, viewModel.uiState.value.post?.commentCount)
        assertEquals("Keep this response", viewModel.uiState.value.draft)
        assertEquals(emptyList(), viewModel.uiState.value.comments)
        assertEquals(SocialActionError.Comment, viewModel.uiState.value.commentError)
    }

    @Test
    fun commentLikeRollsBackWhenTheMutationFails() = runTest {
        val api = FakeSocialApi().apply {
            commentPage = org.omicron.mobile.data.api.CommentPageDto(items = listOf(org.omicron.mobile.data.api.comment()))
            commentLikeFailure = IOException("offline")
        }
        val viewModel = socialViewModel(api, MutableStateFlow<AuthenticatedSession?>(session()))
        viewModel.bind(post())
        testScheduler.advanceUntilIdle()

        viewModel.toggleCommentLike("comment-1")
        assertTrue(viewModel.uiState.value.comments.single().liked)
        testScheduler.advanceUntilIdle()

        assertFalse(viewModel.uiState.value.comments.single().liked)
        assertEquals(SocialActionError.Request, viewModel.uiState.value.commentError)
    }

    @Test
    fun readLaterStateCanBeToggled() = runTest {
        val api = FakeSocialApi()
        val viewModel = socialViewModel(api, MutableStateFlow<AuthenticatedSession?>(session()))
        viewModel.bind(post())
        testScheduler.advanceUntilIdle()

        assertFalse(viewModel.uiState.value.saved)
        viewModel.toggleReadLater()
        testScheduler.advanceUntilIdle()

        assertTrue(viewModel.uiState.value.saved)
        assertTrue(api.saved)
    }

    @Test
    fun failedReadLaterMutationRestoresThePreviousSavedState() = runTest {
        val api = FakeSocialApi().apply { readLaterMutationFailure = IOException("offline") }
        val viewModel = socialViewModel(api, MutableStateFlow<AuthenticatedSession?>(session()))
        viewModel.bind(post())
        testScheduler.advanceUntilIdle()

        viewModel.toggleReadLater()
        assertTrue(viewModel.uiState.value.saved)
        testScheduler.advanceUntilIdle()

        assertFalse(viewModel.uiState.value.saved)
        assertEquals(SocialActionError.Request, viewModel.uiState.value.readLaterError)
    }

    @Test
    fun failedCommentDeletionRestoresTheCommentAndCount() = runTest {
        val api = FakeSocialApi().apply {
            commentPage =
                org.omicron.mobile.data.api.CommentPageDto(
                    items = listOf(
                        org.omicron.mobile.data.api.comment().copy(
                            author = org.omicron.mobile.data.api.PostAuthorDto("user-1", "ada", "Ada"),
                        ),
                    ),
                )
            deleteCommentFailure = IOException("offline")
        }
        val viewModel = socialViewModel(api, MutableStateFlow<AuthenticatedSession?>(session()))
        viewModel.bind(post())
        testScheduler.advanceUntilIdle()

        viewModel.requestDelete("comment-1")
        viewModel.confirmDelete()
        assertTrue(viewModel.uiState.value.comments.isEmpty())
        testScheduler.advanceUntilIdle()

        assertEquals(listOf("comment-1"), viewModel.uiState.value.comments.map { it.id })
        assertEquals(1, viewModel.uiState.value.post?.commentCount)
        assertEquals(SocialActionError.Delete, viewModel.uiState.value.commentError)
    }

    @Test
    fun rejectedSessionShowsExplicitRecoveryState() = runTest {
        val sessions = MutableStateFlow<AuthenticatedSession?>(session())
        val expiration = MutableStateFlow(false)
        val viewModel = socialViewModel(FakeSocialApi(), sessions, expiration)
        viewModel.bind(post())
        testScheduler.advanceUntilIdle()

        sessions.value = null
        expiration.value = true
        testScheduler.advanceUntilIdle()

        assertTrue(viewModel.uiState.value.sessionExpired)
        assertFalse(viewModel.uiState.value.signedIn)
    }

    private fun TestScope.socialViewModel(
        api: FakeSocialApi,
        sessions: MutableStateFlow<AuthenticatedSession?>,
        sessionExpired: MutableStateFlow<Boolean>? = null,
    ): PostSocialViewModel {
        val repository = SocialRepository(api, savedInstance = { instance() }, accessToken = { "signed-token" })
        return PostSocialViewModel(repository, "post-1", TestScope(StandardTestDispatcher(testScheduler)), sessions, sessionExpired)
    }

    private fun session() =
        AuthenticatedSession(
            AuthenticatedUser("user-1", "ada@example.com", "ada", "Ada"),
            "signed-token",
        )

    private fun post() =
        PostDetail(
            id = "post-1",
            title = "Hello",
            contentHtml = "<p>Hello</p>",
            coverUrl = null,
            coverCredit = null,
            language = "en",
            createdAt = "2026-01-01T00:00:00Z",
            author = PostAuthor("writer", "writer", "Writer", null, false),
            tags = emptyList(),
            likeCount = 4,
            commentCount = 1,
            recommendCount = 2,
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
}

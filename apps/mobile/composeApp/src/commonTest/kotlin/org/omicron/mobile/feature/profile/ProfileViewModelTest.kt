package org.omicron.mobile.feature.profile

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.io.IOException
import org.omicron.mobile.data.api.FakeSocialApi
import org.omicron.mobile.data.api.RelationActorDto
import org.omicron.mobile.data.api.localProfile as localProfileFixture
import org.omicron.mobile.data.repository.SocialRepository
import org.omicron.mobile.domain.model.AuthenticatedSession
import org.omicron.mobile.domain.model.AuthenticatedUser
import org.omicron.mobile.domain.model.InstanceConfiguration
import org.omicron.mobile.domain.model.ProfileFollowState
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ProfileViewModelTest {
    @Test
    fun loadsProfileArticlesAndRecommendations() = runTest {
        val api = FakeSocialApi()
        val viewModel = profileViewModel(api)
        testScheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(ProfilePhase.Content, state.phase)
        assertEquals("writer", state.profile?.user?.username)
        assertEquals("profile-cursor", state.articles.cursor)
        assertEquals(listOf("post-1"), state.articles.posts.map { it.id })
        assertEquals(listOf("post-1"), state.recommendations.posts.map { it.id })

        viewModel.loadMore()
        testScheduler.advanceUntilIdle()
        assertEquals(false to "profile-cursor", api.profilePostCursors.last())
    }

    @Test
    fun privateAccountFollowShowsRequestedStateWithoutChangingFollowerCount() = runTest {
        val api = FakeSocialApi().apply {
            localProfileValue = localProfileFixture().copy(user = localProfileFixture().user.copy(isPrivate = true))
        }
        val viewModel = profileViewModel(api, MutableStateFlow<AuthenticatedSession?>(session()))
        testScheduler.advanceUntilIdle()

        viewModel.toggleFollow()
        assertEquals(ProfileFollowState.Requested, viewModel.uiState.value.profile?.followState)
        assertEquals(4, viewModel.uiState.value.profile?.followerCount)
        testScheduler.advanceUntilIdle()

        assertEquals(ProfileFollowState.Requested, viewModel.uiState.value.profile?.followState)
        assertEquals(4, viewModel.uiState.value.profile?.followerCount)
    }

    @Test
    fun failedFollowRollsBackOptimisticProfileState() = runTest {
        val api = FakeSocialApi().apply { followFailure = IOException("offline") }
        val viewModel = profileViewModel(api, MutableStateFlow<AuthenticatedSession?>(session()))
        testScheduler.advanceUntilIdle()

        viewModel.toggleFollow()
        assertEquals(ProfileFollowState.Following, viewModel.uiState.value.profile?.followState)
        assertEquals(5, viewModel.uiState.value.profile?.followerCount)
        testScheduler.advanceUntilIdle()

        assertEquals(ProfileFollowState.None, viewModel.uiState.value.profile?.followState)
        assertEquals(4, viewModel.uiState.value.profile?.followerCount)
        assertEquals(ProfileRelationError.Follow, viewModel.uiState.value.relationError)
    }

    @Test
    fun muteAndBlockOptimisticallyRollBackOnFailure() = runTest {
        val api = FakeSocialApi().apply {
            muteFailure = IOException("offline")
            blockFailure = IOException("offline")
        }
        val viewModel = profileViewModel(api, MutableStateFlow<AuthenticatedSession?>(session()))
        testScheduler.advanceUntilIdle()

        viewModel.toggleMute()
        assertTrue(viewModel.uiState.value.profile!!.isMuted)
        testScheduler.advanceUntilIdle()
        assertFalse(viewModel.uiState.value.profile!!.isMuted)
        assertEquals(ProfileRelationError.Mute, viewModel.uiState.value.relationError)

        viewModel.toggleBlock()
        assertTrue(viewModel.uiState.value.profile!!.isBlocked)
        testScheduler.advanceUntilIdle()
        assertFalse(viewModel.uiState.value.profile!!.isBlocked)
        assertEquals(ProfileRelationError.Block, viewModel.uiState.value.relationError)
    }

    @Test
    fun blockingAProfileAlsoRemovesItsFollowState() = runTest {
        val api = FakeSocialApi().apply {
            localProfileValue = localProfileFixture().copy(isFollowing = true, followState = "following")
        }
        val viewModel = profileViewModel(api, MutableStateFlow<AuthenticatedSession?>(session()))
        testScheduler.advanceUntilIdle()

        viewModel.toggleBlock()
        assertTrue(viewModel.uiState.value.profile!!.isBlocked)
        assertFalse(viewModel.uiState.value.profile!!.isFollowing)
        assertEquals(3, viewModel.uiState.value.profile!!.followerCount)
        testScheduler.advanceUntilIdle()

        assertTrue(api.blocked)
        assertFalse(viewModel.uiState.value.profile!!.isFollowing)
    }

    @Test
    fun followerListLoadsOnlyWhenOpenedAndUsesTheUnpaginatedResponse() = runTest {
        val api = FakeSocialApi().apply {
            relationActors =
                org.omicron.mobile.data.api.RelationActorsDto(
                    items = listOf(RelationActorDto("follower-1", "reader", "Reader")),
                )
        }
        val viewModel = profileViewModel(api, MutableStateFlow<AuthenticatedSession?>(session()))
        testScheduler.advanceUntilIdle()
        assertTrue(viewModel.uiState.value.members.isEmpty())

        viewModel.selectTab(ProfileTab.Followers)
        testScheduler.advanceUntilIdle()

        assertEquals(listOf("reader"), viewModel.uiState.value.members.map { it.username })
        viewModel.selectTab(ProfileTab.About)
        viewModel.selectTab(ProfileTab.Followers)
        testScheduler.advanceUntilIdle()
        assertEquals(1, viewModel.uiState.value.members.size)
    }

    @Test
    fun expiredSessionOffersRecoveryAndDisablesPrivateActions() = runTest {
        val sessions = MutableStateFlow<AuthenticatedSession?>(session())
        val expiration = MutableStateFlow(false)
        val viewModel = profileViewModel(FakeSocialApi(), sessions, expiration)
        testScheduler.advanceUntilIdle()

        sessions.value = null
        expiration.value = true
        testScheduler.advanceUntilIdle()

        assertTrue(viewModel.uiState.value.sessionExpired)
        assertFalse(viewModel.uiState.value.signedIn)
    }

    private fun TestScope.profileViewModel(
        api: FakeSocialApi,
        sessions: MutableStateFlow<AuthenticatedSession?>? = null,
        sessionExpired: MutableStateFlow<Boolean>? = null,
    ): ProfileViewModel {
        api.postPage = org.omicron.mobile.data.api.TimelinePageDto(
            items = listOf(
                org.omicron.mobile.data.api.PostDto(
                    id = "post-1",
                    title = "A post",
                    createdAt = "2026-01-01T00:00:00Z",
                    author = org.omicron.mobile.data.api.PostAuthorDto("user-2", "writer", "Writer"),
                ),
            ),
            nextCursor = "profile-cursor",
        )
        val repository = SocialRepository(api, savedInstance = { instance() }, accessToken = { sessions?.value?.accessToken })
        return ProfileViewModel(
            repository,
            "writer",
            remote = false,
            scope = TestScope(StandardTestDispatcher(testScheduler)),
            session = sessions,
            sessionExpired = sessionExpired,
        )
    }

    private fun session() =
        AuthenticatedSession(
            AuthenticatedUser("user-1", "ada@example.com", "ada", "Ada"),
            "signed-token",
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

package org.omicron.mobile.feature.profile

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.io.IOException
import org.omicron.mobile.data.api.FakeSocialApi
import org.omicron.mobile.data.api.RelationActorDto
import org.omicron.mobile.data.api.RelationActorsDto
import org.omicron.mobile.data.repository.SocialRepository
import org.omicron.mobile.domain.model.AuthenticatedSession
import org.omicron.mobile.domain.model.AuthenticatedUser
import org.omicron.mobile.domain.model.InstanceConfiguration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ProfileConnectionsViewModelTest {
    @Test
    fun opensTheRequestedListAndKeepsEachTabLoadedIndependently() = runTest {
        val api = FakeSocialApi().apply {
            relationHandler = { following -> if (following) actors("following") else actors("follower") }
        }
        val viewModel = connectionsViewModel(api, ProfileConnectionsTab.Following)
        testScheduler.advanceUntilIdle()

        assertEquals(ProfilePhase.Content, viewModel.uiState.value.phase)
        assertEquals(ProfileConnectionsTab.Following, viewModel.uiState.value.selectedTab)
        assertEquals(4, viewModel.uiState.value.profile?.followerCount)
        assertEquals(listOf("following"), viewModel.uiState.value.selectedMembers.items.map { it.username })
        assertEquals(listOf("writer" to true), api.relationRequests)

        viewModel.selectTab(ProfileConnectionsTab.Followers)
        testScheduler.advanceUntilIdle()
        assertEquals(listOf("follower"), viewModel.uiState.value.selectedMembers.items.map { it.username })
        viewModel.selectTab(ProfileConnectionsTab.Following)
        testScheduler.advanceUntilIdle()
        assertEquals(listOf("following"), viewModel.uiState.value.selectedMembers.items.map { it.username })
        viewModel.selectTab(ProfileConnectionsTab.Followers)
        testScheduler.advanceUntilIdle()
        assertEquals(listOf("follower"), viewModel.uiState.value.selectedMembers.items.map { it.username })
        assertEquals(listOf("writer" to true, "writer" to false), api.relationRequests)
        assertTrue(api.profilePostCursors.isEmpty())
    }

    @Test
    fun lateResponseUpdatesOnlyItsOwnTabAndDoesNotReplaceTheSelectedList() = runTest {
        val pendingFollowers = CompletableDeferred<RelationActorsDto>()
        val api = FakeSocialApi().apply {
            relationHandler = { following -> if (following) actors("following") else pendingFollowers.await() }
        }
        val viewModel = connectionsViewModel(api)
        testScheduler.runCurrent()
        assertTrue(viewModel.uiState.value.followers.loading)

        viewModel.selectTab(ProfileConnectionsTab.Following)
        testScheduler.runCurrent()
        pendingFollowers.complete(actors("follower"))
        testScheduler.advanceUntilIdle()

        assertEquals(ProfileConnectionsTab.Following, viewModel.uiState.value.selectedTab)
        assertEquals(listOf("following"), viewModel.uiState.value.selectedMembers.items.map { it.username })
        assertEquals(listOf("follower"), viewModel.uiState.value.followers.items.map { it.username })
        viewModel.selectTab(ProfileConnectionsTab.Followers)
        assertEquals(listOf("follower"), viewModel.uiState.value.selectedMembers.items.map { it.username })
        assertEquals(2, api.relationRequests.size)
    }

    @Test
    fun emptyListsStayLoadedWhenSwitchingTabs() = runTest {
        val api = FakeSocialApi()
        val viewModel = connectionsViewModel(api)
        testScheduler.advanceUntilIdle()
        assertTrue(viewModel.uiState.value.selectedMembers.loaded)
        assertTrue(viewModel.uiState.value.selectedMembers.items.isEmpty())

        viewModel.selectTab(ProfileConnectionsTab.Following)
        testScheduler.advanceUntilIdle()
        viewModel.selectTab(ProfileConnectionsTab.Followers)
        testScheduler.advanceUntilIdle()
        assertEquals(2, api.relationRequests.size)
    }

    @Test
    fun memberOfflineAndServerErrorsCanBeRetriedWithoutLosingTheOtherList() = runTest {
        val api = FakeSocialApi().apply { relationActors = actors("follower") }
        val viewModel = connectionsViewModel(api)
        testScheduler.advanceUntilIdle()

        api.relationFailure = IOException("offline")
        viewModel.selectTab(ProfileConnectionsTab.Following)
        testScheduler.advanceUntilIdle()
        assertEquals(ProfileLoadError.Offline, viewModel.uiState.value.selectedMembers.error)
        assertFalse(viewModel.uiState.value.selectedMembers.loading)

        api.relationFailure = IllegalStateException("server")
        viewModel.retry()
        testScheduler.advanceUntilIdle()
        assertEquals(ProfileLoadError.Server, viewModel.uiState.value.selectedMembers.error)

        api.relationFailure = null
        api.relationActors = actors("following")
        viewModel.retry()
        testScheduler.advanceUntilIdle()
        assertEquals(listOf("following"), viewModel.uiState.value.selectedMembers.items.map { it.username })
        assertEquals(listOf("follower"), viewModel.uiState.value.followers.items.map { it.username })
    }

    @Test
    fun profileOfflineErrorCanBeRetriedBeforeAnyMembersAreLoaded() = runTest {
        val api = FakeSocialApi().apply { profileFailure = IOException("offline") }
        val viewModel = connectionsViewModel(api)
        testScheduler.advanceUntilIdle()
        assertEquals(ProfilePhase.Error(ProfileLoadError.Offline), viewModel.uiState.value.phase)
        assertTrue(api.relationRequests.isEmpty())

        api.profileFailure = null
        viewModel.retry()
        testScheduler.advanceUntilIdle()
        assertEquals(ProfilePhase.Content, viewModel.uiState.value.phase)
        assertEquals(listOf("writer" to false), api.relationRequests)
    }

    @Test
    fun lockedProfilesDoNotRequestEitherMemberList() = runTest {
        val api = FakeSocialApi().apply { localProfileValue = localProfileValue.copy(locked = true) }
        val viewModel = connectionsViewModel(api)
        testScheduler.advanceUntilIdle()
        viewModel.selectTab(ProfileConnectionsTab.Following)
        viewModel.retry()
        testScheduler.advanceUntilIdle()

        assertTrue(viewModel.uiState.value.profile!!.locked)
        assertTrue(api.relationRequests.isEmpty())
    }

    @Test
    fun sessionLossClearsPrivateMembersAndCancelsInFlightLoads() = runTest {
        val sessions = MutableStateFlow<AuthenticatedSession?>(session())
        val expired = MutableStateFlow(false)
        val pendingFollowing = CompletableDeferred<RelationActorsDto>()
        val api = FakeSocialApi().apply {
            relationHandler = { following -> if (following) pendingFollowing.await() else actors("private-follower") }
        }
        val viewModel = connectionsViewModel(api, sessions = sessions, expired = expired)
        testScheduler.advanceUntilIdle()
        assertEquals(1, viewModel.uiState.value.followers.items.size)
        viewModel.selectTab(ProfileConnectionsTab.Following)
        testScheduler.runCurrent()

        api.localProfileValue = api.localProfileValue.copy(locked = true)
        sessions.value = null
        expired.value = true
        testScheduler.runCurrent()
        pendingFollowing.complete(actors("private-following"))
        testScheduler.advanceUntilIdle()

        assertTrue(viewModel.uiState.value.sessionExpired)
        assertTrue(viewModel.uiState.value.profile!!.locked)
        assertTrue(viewModel.uiState.value.followers.items.isEmpty())
        assertTrue(viewModel.uiState.value.following.items.isEmpty())
        assertEquals(2, api.relationRequests.size)
    }

    private fun TestScope.connectionsViewModel(
        api: FakeSocialApi,
        tab: ProfileConnectionsTab = ProfileConnectionsTab.Followers,
        sessions: MutableStateFlow<AuthenticatedSession?>? = null,
        expired: MutableStateFlow<Boolean>? = null,
    ) = ProfileConnectionsViewModel(
        repository = SocialRepository(api, savedInstance = { instance() }, accessToken = { sessions?.value?.accessToken }),
        username = "writer",
        initialTab = tab,
        scope = TestScope(StandardTestDispatcher(testScheduler)),
        session = sessions,
        sessionExpired = expired,
    )

    private fun actors(username: String) = RelationActorsDto(items = listOf(RelationActorDto(username, username, username)))

    private fun session() = AuthenticatedSession(AuthenticatedUser("viewer", "ada@example.com", "ada", "Ada"), "signed-token")

    private fun instance() = InstanceConfiguration("https://omicron.blog", "Omicron", "omicron.blog", true, true, true, true)
}

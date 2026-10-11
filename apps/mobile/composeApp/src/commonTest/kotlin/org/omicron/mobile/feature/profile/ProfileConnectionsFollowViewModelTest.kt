package org.omicron.mobile.feature.profile

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.io.IOException
import org.omicron.mobile.data.api.FakeSocialApi
import org.omicron.mobile.data.api.FollowStateDto
import org.omicron.mobile.data.api.RelationActorDto
import org.omicron.mobile.data.api.RelationActorsDto
import org.omicron.mobile.data.repository.SocialRepository
import org.omicron.mobile.domain.model.AuthenticatedSession
import org.omicron.mobile.domain.model.AuthenticatedUser
import org.omicron.mobile.domain.model.InstanceConfiguration
import org.omicron.mobile.domain.model.ProfileFollowState
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ProfileConnectionsFollowViewModelTest {
    @Test
    fun ownFollowingMembershipConfirmsLocalAndRemoteRelationshipsWithoutProfileChecks() = runTest {
        val members = (1..24).map { actor("reader-$it") } + actor("writer@remote.example", remote = true)
        val api = api().apply {
            localProfileValue = localProfileValue.copy(user = localProfileValue.user.copy(id = "viewer"), counts = localProfileValue.counts.copy(following = 25))
            relationActors = RelationActorsDto(members + actor("ada", id = "viewer"))
            localProfileHandler = { username ->
                if (username != "writer") throw IOException("unnecessary profile read")
                localProfileValue
            }
        }
        val viewModel = viewModel(api, tab = ProfileConnectionsTab.Following)
        testScheduler.advanceUntilIdle()

        assertEquals(listOf("writer" to false), api.profileRequests)
        assertEquals(25, viewModel.uiState.value.memberFollows.size)
        assertEquals(25, viewModel.uiState.value.profile?.followingCount)
        assertNull(viewModel.uiState.value.memberFollows["ada"])
        members.forEach { member ->
            val follow = viewModel.uiState.value.memberFollows[member.username]!!
            assertEquals(ProfileFollowState.Following, follow.followState)
            assertFalse(follow.loading)
            assertNull(follow.loadError)
        }

        viewModel.selectTab(ProfileConnectionsTab.Followers)
        testScheduler.advanceUntilIdle()
        members.reversed().forEach { viewModel.loadMemberFollow(it.username) }
        testScheduler.advanceUntilIdle()
        assertEquals(listOf("writer" to false), api.profileRequests)
    }

    @Test
    fun ownFollowingMembershipCancelsPendingChecksStartedFromFollowers() = runTest {
        val gate = CompletableDeferred<Unit>()
        var cancelled = 0
        val api = api().apply {
            localProfileValue = localProfileValue.copy(user = localProfileValue.user.copy(id = "viewer"), counts = localProfileValue.counts.copy(following = 8))
            relationActors = RelationActorsDto((1..8).map { actor("reader-$it") })
            localProfileHandler = { username ->
                if (username != "writer") {
                    try {
                        gate.await()
                    } finally {
                        cancelled += 1
                    }
                }
                localProfileValue
            }
        }
        val viewModel = viewModel(api)
        testScheduler.runCurrent()
        assertEquals(8, viewModel.uiState.value.memberFollows.values.count { it.loading })
        assertEquals(4, api.profileRequests.count { it.first != "writer" })

        viewModel.selectTab(ProfileConnectionsTab.Following)
        testScheduler.runCurrent()
        assertEquals(4, cancelled)
        assertEquals(8, viewModel.uiState.value.profile?.followingCount)
        assertTrue(viewModel.uiState.value.memberFollows.values.all { it.followState == ProfileFollowState.Following && !it.loading && it.loadError == null })

        gate.complete(Unit)
        testScheduler.advanceUntilIdle()
        assertEquals(4, api.profileRequests.count { it.first != "writer" })
        assertTrue(viewModel.uiState.value.memberFollows.values.all { it.followState == ProfileFollowState.Following })
    }

    @Test
    fun ownFollowingMembershipIsRevalidatedForAnotherViewer() = runTest {
        val api = api().apply { localProfileValue = localProfileValue.copy(user = localProfileValue.user.copy(id = "viewer")) }
        val sessions = MutableStateFlow<AuthenticatedSession?>(session())
        val viewModel = viewModel(api, tab = ProfileConnectionsTab.Following, sessions = sessions)
        testScheduler.advanceUntilIdle()
        assertEquals(ProfileFollowState.Following, viewModel.uiState.value.memberFollows["reader"]?.followState)
        assertEquals(listOf("writer" to false), api.profileRequests)

        sessions.value = AuthenticatedSession(AuthenticatedUser("next-viewer", "bea@example.com", "bea", "Bea"), "next-token")
        testScheduler.advanceUntilIdle()
        assertFalse(viewModel.uiState.value.isOwnProfile)
        assertEquals(ProfileFollowState.None, viewModel.uiState.value.memberFollows["reader"]?.followState)
        assertEquals(listOf("writer" to false, "writer" to false, "reader" to false), api.profileRequests)
    }

    @Test
    fun membershipSeededRowsUseTheServerResponseForPrivateRefollows() = runTest {
        val api = api().apply {
            localProfileValue = localProfileValue.copy(user = localProfileValue.user.copy(id = "viewer", isPrivate = true), counts = localProfileValue.counts.copy(following = 1))
        }
        val viewModel = viewModel(api, tab = ProfileConnectionsTab.Following)
        testScheduler.advanceUntilIdle()
        viewModel.selectTab(ProfileConnectionsTab.Followers)
        testScheduler.advanceUntilIdle()

        viewModel.requestFollowChange("reader")
        assertEquals("reader", viewModel.uiState.value.pendingUnfollow)
        assertTrue(api.followRequests.isEmpty())
        viewModel.confirmUnfollow()
        testScheduler.advanceUntilIdle()
        assertEquals(ProfileFollowState.None, viewModel.uiState.value.memberFollows["reader"]?.followState)
        assertEquals(0, viewModel.uiState.value.profile?.followingCount)

        viewModel.requestFollowChange("reader")
        testScheduler.advanceUntilIdle()
        assertEquals(ProfileFollowState.Requested, viewModel.uiState.value.memberFollows["reader"]?.followState)
        assertEquals(0, viewModel.uiState.value.profile?.followingCount)
        assertTrue(viewModel.uiState.value.following.items.isEmpty())
        assertEquals(listOf(Triple("reader", false, false), Triple("reader", false, true)), api.followRequests)
        assertEquals(listOf("writer" to false), api.profileRequests)
    }

    @Test
    fun offscreenRelationshipsFinishWhileTheListRemainsOpenAndStayReadyWhenScrolling() = runTest {
        ProfileConnectionsTab.entries.forEach { tab ->
            val members = (1..24).map { actor("reader-$it") }
            val api = api().apply {
                relationActors = RelationActorsDto(members)
                localProfileHandler = { username ->
                    if (username != "writer") delay(100)
                    localProfileValue.copy(followState = "following", isFollowing = true)
                }
            }
            val viewModel = viewModel(api, tab = tab)
            testScheduler.advanceUntilIdle()

            assertEquals(24, viewModel.uiState.value.selectedMembers.items.size)
            assertEquals(24, viewModel.uiState.value.memberFollows.size)
            members.forEach { member ->
                val follow = viewModel.uiState.value.memberFollows[member.username]!!
                assertEquals(ProfileFollowState.Following, follow.followState)
                assertFalse(follow.loading)
            }

            members.reversed().forEach { viewModel.loadMemberFollow(it.username) }
            testScheduler.advanceUntilIdle()
            assertEquals(25, api.profileRequests.size)
            viewModel.close()
        }
    }

    @Test
    fun relationshipsLoadOnListArrivalUseTheCorrectProfileRoutesAndAreSharedAcrossTabs() = runTest {
        val api = api().apply {
            remoteProfileValue = remoteProfileValue.copy(isFollowing = true)
            relationActors = RelationActorsDto(listOf(actor("reader"), actor("writer@remote.example", remote = true)))
        }
        val viewModel = viewModel(api)
        testScheduler.advanceUntilIdle()
        assertEquals(ProfileFollowState.None, viewModel.uiState.value.memberFollows["reader"]?.followState)
        assertEquals(ProfileFollowState.Following, viewModel.uiState.value.memberFollows["writer@remote.example"]?.followState)
        assertEquals(listOf("writer" to false, "reader" to false, "writer@remote.example" to true), api.profileRequests)

        viewModel.selectTab(ProfileConnectionsTab.Following)
        testScheduler.advanceUntilIdle()
        viewModel.loadMemberFollow("reader")
        testScheduler.advanceUntilIdle()
        assertEquals(3, api.profileRequests.size)
    }

    @Test
    fun followingRequiresConfirmationAndCancelDoesNotSendUnfollow() = runTest {
        val api = api().apply { localProfileValue = localProfileValue.copy(followState = "following", isFollowing = true) }
        val viewModel = viewModel(api)
        testScheduler.advanceUntilIdle()
        viewModel.loadMemberFollow("reader")
        testScheduler.advanceUntilIdle()

        viewModel.requestFollowChange("reader")
        assertEquals("reader", viewModel.uiState.value.pendingUnfollow)
        assertTrue(api.followRequests.isEmpty())
        viewModel.cancelUnfollow()
        viewModel.confirmUnfollow()
        testScheduler.advanceUntilIdle()
        assertTrue(api.followRequests.isEmpty())
        assertEquals(ProfileFollowState.Following, viewModel.uiState.value.memberFollows["reader"]?.followState)

        viewModel.requestFollowChange("reader")
        viewModel.confirmUnfollow()
        viewModel.confirmUnfollow()
        viewModel.requestFollowChange("reader")
        assertNull(viewModel.uiState.value.pendingUnfollow)
        assertTrue(viewModel.uiState.value.memberFollows["reader"]!!.busy)
        testScheduler.advanceUntilIdle()
        assertEquals(listOf(Triple("reader", false, false)), api.followRequests)
        assertEquals(ProfileFollowState.None, viewModel.uiState.value.memberFollows["reader"]?.followState)
        assertEquals(6, viewModel.uiState.value.profile?.followingCount)
        assertEquals(listOf("reader"), viewModel.uiState.value.followers.items.map { it.username })
    }

    @Test
    fun privateFollowUsesRequestedAndCancellationAlsoRequiresConfirmation() = runTest {
        val api = api().apply { localProfileValue = localProfileValue.copy(user = localProfileValue.user.copy(isPrivate = true)) }
        val viewModel = viewModel(api)
        testScheduler.advanceUntilIdle()
        viewModel.loadMemberFollow("reader")
        testScheduler.advanceUntilIdle()

        viewModel.requestFollowChange("reader")
        assertEquals(ProfileFollowState.Requested, viewModel.uiState.value.memberFollows["reader"]?.followState)
        viewModel.requestFollowChange("reader")
        testScheduler.advanceUntilIdle()
        assertEquals(listOf(Triple("reader", false, true)), api.followRequests)

        viewModel.requestFollowChange("reader")
        assertEquals("reader", viewModel.uiState.value.pendingUnfollow)
        assertEquals(1, api.followRequests.size)
        viewModel.confirmUnfollow()
        testScheduler.advanceUntilIdle()
        assertEquals(ProfileFollowState.None, viewModel.uiState.value.memberFollows["reader"]?.followState)
        assertEquals(Triple("reader", false, false), api.followRequests.last())
    }

    @Test
    fun remoteFollowUsesRemoteMutationAndRollsBackOfflineFailure() = runTest {
        val username = "writer@remote.example"
        val api = api().apply {
            relationActors = RelationActorsDto(listOf(actor(username, remote = true)))
            followFailure = IOException("offline")
        }
        val viewModel = viewModel(api)
        testScheduler.advanceUntilIdle()
        viewModel.loadMemberFollow(username)
        testScheduler.advanceUntilIdle()

        viewModel.requestFollowChange(username)
        assertEquals(ProfileFollowState.Following, viewModel.uiState.value.memberFollows[username]?.followState)
        testScheduler.advanceUntilIdle()
        val follow = viewModel.uiState.value.memberFollows[username]!!
        assertEquals(ProfileFollowState.None, follow.followState)
        assertEquals(ProfileLoadError.Offline, follow.mutationError)
        assertFalse(follow.busy)
        assertEquals(listOf(Triple(username, true, true)), api.followRequests)
    }

    @Test
    fun ownFollowingCountRollsBackOnFailureAndRowsAreRemovedOnlyAfterSuccess() = runTest {
        val api = api().apply {
            localProfileValue = localProfileValue.copy(user = localProfileValue.user.copy(id = "viewer"), followState = "following", isFollowing = true)
            followFailure = IOException("offline")
        }
        val viewModel = viewModel(api, tab = ProfileConnectionsTab.Following)
        testScheduler.advanceUntilIdle()
        viewModel.loadMemberFollow("reader")
        testScheduler.advanceUntilIdle()
        assertEquals(6, viewModel.uiState.value.profile?.followingCount)

        viewModel.requestFollowChange("reader")
        viewModel.confirmUnfollow()
        assertEquals(5, viewModel.uiState.value.profile?.followingCount)
        assertEquals(1, viewModel.uiState.value.following.items.size)
        testScheduler.advanceUntilIdle()
        assertEquals(6, viewModel.uiState.value.profile?.followingCount)
        assertEquals(1, viewModel.uiState.value.following.items.size)

        api.followFailure = null
        viewModel.requestFollowChange("reader")
        viewModel.confirmUnfollow()
        testScheduler.advanceUntilIdle()
        assertEquals(5, viewModel.uiState.value.profile?.followingCount)
        assertTrue(viewModel.uiState.value.following.items.isEmpty())
    }

    @Test
    fun newOwnFollowInvalidatesFollowingAndUsesTheAuthoritativeServerState() = runTest {
        val api = api().apply {
            localProfileValue = localProfileValue.copy(user = localProfileValue.user.copy(id = "viewer", isPrivate = true))
            followHandler = { _, _, _ -> FollowStateDto("following") }
        }
        val viewModel = viewModel(api)
        testScheduler.advanceUntilIdle()
        viewModel.selectTab(ProfileConnectionsTab.Following)
        testScheduler.advanceUntilIdle()
        viewModel.selectTab(ProfileConnectionsTab.Followers)
        viewModel.loadMemberFollow("reader")
        testScheduler.advanceUntilIdle()

        viewModel.requestFollowChange("reader")
        assertEquals(ProfileFollowState.Requested, viewModel.uiState.value.memberFollows["reader"]?.followState)
        assertEquals(6, viewModel.uiState.value.profile?.followingCount)
        testScheduler.advanceUntilIdle()
        assertEquals(ProfileFollowState.Following, viewModel.uiState.value.memberFollows["reader"]?.followState)
        assertEquals(7, viewModel.uiState.value.profile?.followingCount)
        assertFalse(viewModel.uiState.value.following.loaded)

        api.relationActors = RelationActorsDto(listOf(actor("server-first"), actor("reader")))
        viewModel.selectTab(ProfileConnectionsTab.Following)
        testScheduler.advanceUntilIdle()
        assertEquals(listOf("server-first", "reader"), viewModel.uiState.value.following.items.map { it.username })
        assertEquals(3, api.relationRequests.size)
    }

    @Test
    fun failedRelationshipChecksCanRetryWithoutGuessingOrSendingAMutation() = runTest {
        val api = api().apply {
            localProfileHandler = { username ->
                if (username == "reader") throw IOException("offline")
                localProfileValue
            }
        }
        val viewModel = viewModel(api)
        testScheduler.advanceUntilIdle()
        assertNull(viewModel.uiState.value.memberFollows["reader"]?.followState)
        assertEquals(ProfileLoadError.Offline, viewModel.uiState.value.memberFollows["reader"]?.loadError)
        assertTrue(api.followRequests.isEmpty())

        api.localProfileHandler = null
        viewModel.selectTab(ProfileConnectionsTab.Following)
        testScheduler.advanceUntilIdle()
        assertEquals(ProfileLoadError.Offline, viewModel.uiState.value.memberFollows["reader"]?.loadError)
        assertEquals(2, api.profileRequests.size)

        viewModel.requestFollowChange("reader")
        testScheduler.advanceUntilIdle()
        assertEquals(ProfileFollowState.None, viewModel.uiState.value.memberFollows["reader"]?.followState)
        assertEquals(3, api.profileRequests.size)
        assertTrue(api.followRequests.isEmpty())
    }

    @Test
    fun guestsAndSelfRowsNeverCheckOrMutateRelationships() = runTest {
        val api = api().apply { relationActors = RelationActorsDto(listOf(actor("ada", id = "viewer"))) }
        val sessions = MutableStateFlow<AuthenticatedSession?>(null)
        val viewModel = viewModel(api, sessions = sessions)
        testScheduler.advanceUntilIdle()
        viewModel.loadMemberFollow("ada")
        viewModel.requestFollowChange("ada")
        testScheduler.advanceUntilIdle()
        sessions.value = session()
        testScheduler.advanceUntilIdle()
        viewModel.loadMemberFollow("ada")
        viewModel.requestFollowChange("ada")
        testScheduler.advanceUntilIdle()
        assertEquals(listOf("writer" to false, "writer" to false), api.profileRequests)
        assertTrue(api.followRequests.isEmpty())
        assertTrue(viewModel.uiState.value.memberFollows.isEmpty())
    }

    @Test
    fun sessionLossCancelsAnInFlightMutationAndClearsFollowState() = runTest {
        val pending = CompletableDeferred<FollowStateDto>()
        val api = api().apply { followHandler = { _, _, _ -> pending.await() } }
        val sessions = MutableStateFlow<AuthenticatedSession?>(session())
        val viewModel = viewModel(api, sessions = sessions)
        testScheduler.advanceUntilIdle()
        viewModel.loadMemberFollow("reader")
        testScheduler.advanceUntilIdle()
        viewModel.requestFollowChange("reader")
        testScheduler.runCurrent()
        assertTrue(viewModel.uiState.value.memberFollows["reader"]!!.busy)

        sessions.value = null
        testScheduler.runCurrent()
        pending.complete(FollowStateDto("following"))
        testScheduler.advanceUntilIdle()
        assertFalse(viewModel.uiState.value.signedIn)
        assertTrue(viewModel.uiState.value.memberFollows.isEmpty())
        assertNull(viewModel.uiState.value.pendingUnfollow)
    }

    @Test
    fun changingAccountsClosesConfirmationAndCannotUnfollowUsingTheNextAccountsToken() = runTest {
        val api = api().apply { localProfileValue = localProfileValue.copy(followState = "following", isFollowing = true) }
        val sessions = MutableStateFlow<AuthenticatedSession?>(session())
        val viewModel = viewModel(api, sessions = sessions)
        testScheduler.advanceUntilIdle()
        viewModel.loadMemberFollow("reader")
        testScheduler.advanceUntilIdle()
        viewModel.requestFollowChange("reader")
        assertEquals("reader", viewModel.uiState.value.pendingUnfollow)

        api.localProfileValue = api.localProfileValue.copy(followState = "none", isFollowing = false)
        sessions.value = AuthenticatedSession(AuthenticatedUser("next-viewer", "bea@example.com", "bea", "Bea"), "next-token")
        viewModel.confirmUnfollow()
        testScheduler.advanceUntilIdle()

        assertTrue(api.followRequests.isEmpty())
        assertNull(viewModel.uiState.value.pendingUnfollow)
        assertEquals(ProfileFollowState.None, viewModel.uiState.value.memberFollows["reader"]?.followState)
        assertEquals(2, api.profileRequests.count { it.first == "reader" })
        assertEquals("next-viewer", viewModel.uiState.value.currentUserId)
    }

    @Test
    fun backgroundRelationshipChecksHaveAtMostFourConcurrentRequests() = runTest {
        val gate = CompletableDeferred<Unit>()
        var active = 0
        var maximum = 0
        val api = api().apply {
            relationActors = RelationActorsDto((1..6).map { actor("reader-$it") })
            localProfileHandler = { username ->
                if (username != "writer") {
                    active += 1
                    maximum = maxOf(maximum, active)
                    gate.await()
                    active -= 1
                }
                localProfileValue
            }
        }
        val viewModel = viewModel(api)
        testScheduler.runCurrent()
        assertTrue(viewModel.uiState.value.selectedMembers.loaded)
        assertEquals(4, active)
        gate.complete(Unit)
        testScheduler.advanceUntilIdle()
        assertEquals(4, maximum)
        assertEquals(6, viewModel.uiState.value.memberFollows.values.count { it.followState != null })
    }

    @Test
    fun sessionLossCancelsActiveAndQueuedBackgroundChecks() = runTest {
        val gate = CompletableDeferred<Unit>()
        var cancelled = 0
        val api = api().apply {
            relationActors = RelationActorsDto((1..8).map { actor("reader-$it") })
            localProfileHandler = { username ->
                if (username != "writer") {
                    try {
                        gate.await()
                    } finally {
                        cancelled += 1
                    }
                }
                localProfileValue
            }
        }
        val sessions = MutableStateFlow<AuthenticatedSession?>(session())
        val viewModel = viewModel(api, sessions = sessions)
        testScheduler.runCurrent()
        assertEquals(8, viewModel.uiState.value.memberFollows.values.count { it.loading })
        assertEquals(4, api.profileRequests.count { it.first != "writer" })

        sessions.value = null
        testScheduler.runCurrent()
        assertEquals(4, cancelled)
        gate.complete(Unit)
        testScheduler.advanceUntilIdle()
        assertFalse(viewModel.uiState.value.signedIn)
        assertTrue(viewModel.uiState.value.memberFollows.isEmpty())
        assertEquals(4, api.profileRequests.count { it.first != "writer" })
    }

    @Test
    fun closingTheDestinationCancelsActiveAndQueuedBackgroundChecks() = runTest {
        val gate = CompletableDeferred<Unit>()
        var finished = 0
        val api = api().apply {
            relationActors = RelationActorsDto((1..8).map { actor("reader-$it") })
            localProfileHandler = { username ->
                if (username != "writer") {
                    try {
                        gate.await()
                    } finally {
                        finished += 1
                    }
                }
                localProfileValue
            }
        }
        val viewModel = viewModel(api)
        testScheduler.runCurrent()
        assertEquals(4, api.profileRequests.count { it.first != "writer" })

        viewModel.close()
        testScheduler.runCurrent()
        assertEquals(4, finished)
        gate.complete(Unit)
        testScheduler.advanceUntilIdle()
        assertEquals(4, api.profileRequests.count { it.first != "writer" })
        assertTrue(viewModel.uiState.value.memberFollows.values.all { it.followState == null })
    }

    private fun api() = FakeSocialApi().apply {
        remoteProfileValue = remoteProfileValue.copy(isFollowing = false)
        relationActors = RelationActorsDto(listOf(actor("reader")))
    }

    private fun TestScope.viewModel(
        api: FakeSocialApi,
        tab: ProfileConnectionsTab = ProfileConnectionsTab.Followers,
        sessions: MutableStateFlow<AuthenticatedSession?> = MutableStateFlow(session()),
    ) = ProfileConnectionsViewModel(
        SocialRepository(api, savedInstance = { InstanceConfiguration("https://omicron.blog", "Omicron", "omicron.blog", true, true, true, true) }, accessToken = { sessions.value?.accessToken }),
        "writer",
        tab,
        scope = TestScope(StandardTestDispatcher(testScheduler)),
        session = sessions,
    )

    private fun actor(username: String, remote: Boolean = false, id: String = username) = RelationActorDto(id, username, username, remote = remote)

    private fun session() = AuthenticatedSession(AuthenticatedUser("viewer", "ada@example.com", "ada", "Ada"), "signed-token")
}

package org.omicron.mobile.feature.profile

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.io.IOException
import org.omicron.mobile.data.repository.SocialRepository
import org.omicron.mobile.domain.model.AuthenticatedSession
import org.omicron.mobile.domain.model.Profile
import org.omicron.mobile.domain.model.ProfileFollowState
import org.omicron.mobile.domain.model.RelationActor

class ProfileConnectionsViewModel(
    private val repository: SocialRepository,
    username: String,
    initialTab: ProfileConnectionsTab,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
    private val session: StateFlow<AuthenticatedSession?>? = null,
    sessionExpired: StateFlow<Boolean>? = null,
) {
    private val mutableUiState = MutableStateFlow(
        ProfileConnectionsUiState(
            username = username,
            selectedTab = initialTab,
            sessionExpired = sessionExpired?.value ?: false,
            currentUserId = session?.value?.user?.id,
            currentUsername = session?.value?.user?.username,
        ),
    )
    val uiState: StateFlow<ProfileConnectionsUiState> = mutableUiState.asStateFlow()
    private var profileJob: Job? = null
    private val memberJobs = mutableMapOf<ProfileConnectionsTab, Job>()
    private val relationshipJobs = mutableMapOf<String, Job>()
    private val followJobs = mutableMapOf<String, Job>()
    private val relationshipChecks = Semaphore(4)
    private var viewerId = session?.value?.user?.id

    init {
        session?.let { sessions ->
            scope.launch {
                sessions.collect { current ->
                    if (viewerId != current?.user?.id) {
                        viewerId = current?.user?.id
                        mutableUiState.update { it.copy(currentUserId = current?.user?.id, currentUsername = current?.user?.username) }
                        loadProfile()
                    }
                }
            }
        }
        sessionExpired?.let { expirations ->
            scope.launch { expirations.collect { expired -> mutableUiState.update { it.copy(sessionExpired = expired) } } }
        }
        loadProfile()
    }

    fun selectTab(tab: ProfileConnectionsTab) {
        mutableUiState.update { it.copy(selectedTab = tab, pendingUnfollow = null) }
        loadMembers(tab)
    }

    fun retry() {
        if (mutableUiState.value.phase != ProfilePhase.Content) {
            loadProfile()
        } else {
            loadMembers(mutableUiState.value.selectedTab, force = true)
        }
    }

    fun close() {
        scope.cancel()
    }

    fun loadMemberFollow(username: String) {
        val state = mutableUiState.value
        val actor = state.actor(username) ?: return
        if (!state.canFollow(actor) || !isCurrentViewer(state.currentUserId)) return
        val previous = state.memberFollows[username]
        if (previous?.loading == true || previous?.busy == true || previous?.followState != null) return
        val requestViewerId = state.currentUserId
        mutableUiState.update { it.withMemberFollow(username, ProfileMemberFollow(loading = true)) }
        relationshipJobs[username] = scope.launch {
            try {
                val profile = relationshipChecks.withPermit { repository.profile(username, actor.remote) }
                ensureActive()
                mutableUiState.update {
                    if (!isCurrentViewer(requestViewerId)) it
                    else it.withMemberFollow(username, ProfileMemberFollow(followState = profile.followState, isPrivate = profile.user.isPrivate))
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (exception: Throwable) {
                mutableUiState.update {
                    if (!isCurrentViewer(requestViewerId)) it
                    else it.withMemberFollow(username, ProfileMemberFollow(loadError = exception.toMemberError()))
                }
            }
        }
    }

    fun requestFollowChange(username: String) {
        val state = mutableUiState.value
        val actor = state.actor(username) ?: return
        if (!state.canFollow(actor) || !isCurrentViewer(state.currentUserId)) return
        val follow = state.memberFollows[username]
        if (follow?.loading == true || follow?.busy == true) return
        when (follow?.followState) {
            null -> loadMemberFollow(username)
            ProfileFollowState.None -> changeFollow(actor, following = true)
            ProfileFollowState.Following, ProfileFollowState.Requested -> mutableUiState.update { it.copy(pendingUnfollow = username) }
        }
    }

    fun cancelUnfollow() {
        mutableUiState.update { it.copy(pendingUnfollow = null) }
    }

    fun confirmUnfollow() {
        val state = mutableUiState.value
        val username = state.pendingUnfollow ?: return
        val actor = state.actor(username) ?: return
        val follow = state.memberFollows[username] ?: return
        if (!state.canFollow(actor) || !isCurrentViewer(state.currentUserId) || follow.busy || follow.followState == null || follow.followState == ProfileFollowState.None) return
        changeFollow(actor, following = false)
    }

    private fun changeFollow(actor: RelationActor, following: Boolean) {
        val state = mutableUiState.value
        val before = state.memberFollows[actor.username] ?: return
        val requestViewerId = state.currentUserId
        val optimistic = when {
            !following -> ProfileFollowState.None
            !actor.remote && before.isPrivate -> ProfileFollowState.Requested
            else -> ProfileFollowState.Following
        }
        mutableUiState.update {
            it.withMemberFollow(actor.username, before.copy(followState = optimistic, busy = true, mutationError = null)).copy(pendingUnfollow = null)
        }
        followJobs[actor.username] = scope.launch {
            try {
                val actual = repository.setFollow(actor.username, actor.remote, following)
                ensureActive()
                mutableUiState.update {
                    if (!isCurrentViewer(requestViewerId)) return@update it
                    val next = it.withMemberFollow(actor.username, before.copy(followState = actual, busy = false, mutationError = null))
                    if (!next.isOwnProfile) next
                    else if (actual != ProfileFollowState.Following) next.copy(following = next.following.copy(items = next.following.items.filterNot { member -> member.username == actor.username }))
                    else next.copy(following = next.following.copy(loaded = false))
                }
                if (isCurrentViewer(requestViewerId) && mutableUiState.value.isOwnProfile && mutableUiState.value.selectedTab == ProfileConnectionsTab.Following) {
                    loadMembers(ProfileConnectionsTab.Following)
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (exception: Throwable) {
                mutableUiState.update {
                    if (!isCurrentViewer(requestViewerId)) it
                    else it.withMemberFollow(actor.username, before.copy(busy = false, mutationError = exception.toMemberError()))
                }
            }
        }
    }

    private fun isCurrentViewer(id: String?): Boolean = id != null && mutableUiState.value.currentUserId == id && session?.value?.user?.id == id

    private fun loadProfile() {
        profileJob?.cancel()
        memberJobs.values.forEach(Job::cancel)
        memberJobs.clear()
        relationshipJobs.values.forEach(Job::cancel)
        relationshipJobs.clear()
        followJobs.values.forEach(Job::cancel)
        followJobs.clear()
        mutableUiState.update {
            it.copy(phase = ProfilePhase.Loading, profile = null, followers = ProfileMemberList(), following = ProfileMemberList(), memberFollows = emptyMap(), pendingUnfollow = null)
        }
        profileJob = scope.launch {
            try {
                val profile = repository.profile(mutableUiState.value.username, remote = false)
                ensureActive()
                mutableUiState.update { it.copy(profile = profile, phase = ProfilePhase.Content) }
                loadMembers(mutableUiState.value.selectedTab)
            } catch (exception: CancellationException) {
                throw exception
            } catch (exception: Throwable) {
                mutableUiState.update { it.copy(phase = exception.toProfilePhase()) }
            }
        }
    }

    private fun loadMembers(tab: ProfileConnectionsTab, force: Boolean = false) {
        val state = mutableUiState.value
        val profile = state.profile ?: return
        if (profile.locked || profile.remote) return
        val list = state.members(tab)
        if (list.loading || (list.loaded && !force)) return
        mutableUiState.update { it.withMembers(tab, ProfileMemberList(loading = true)) }
        memberJobs[tab] = scope.launch {
            try {
                val actors = repository.profileRelations(state.username, following = tab == ProfileConnectionsTab.Following)
                ensureActive()
                mutableUiState.update { it.withMembers(tab, ProfileMemberList(items = actors, loaded = true)) }
            } catch (exception: CancellationException) {
                throw exception
            } catch (exception: Throwable) {
                val error = if (exception is IOException) ProfileLoadError.Offline else ProfileLoadError.Server
                mutableUiState.update { it.withMembers(tab, ProfileMemberList(error = error)) }
            }
        }
    }
}

data class ProfileConnectionsUiState(
    val username: String,
    val phase: ProfilePhase = ProfilePhase.Loading,
    val profile: Profile? = null,
    val selectedTab: ProfileConnectionsTab = ProfileConnectionsTab.Followers,
    val followers: ProfileMemberList = ProfileMemberList(),
    val following: ProfileMemberList = ProfileMemberList(),
    val sessionExpired: Boolean = false,
    val currentUserId: String? = null,
    val currentUsername: String? = null,
    val memberFollows: Map<String, ProfileMemberFollow> = emptyMap(),
    val pendingUnfollow: String? = null,
) {
    val selectedMembers: ProfileMemberList get() = members(selectedTab)
    val signedIn: Boolean get() = currentUserId != null
    val isOwnProfile: Boolean get() = signedIn && profile?.user?.id == currentUserId

    internal fun actor(username: String): RelationActor? = (followers.items + following.items).firstOrNull { it.username == username }

    internal fun canFollow(actor: RelationActor): Boolean = signedIn && (actor.remote || (actor.id != currentUserId && actor.username != currentUsername))

    internal fun withMemberFollow(username: String, follow: ProfileMemberFollow): ProfileConnectionsUiState {
        val previous = memberFollows[username]?.followState
        val delta = (if (follow.followState == ProfileFollowState.Following) 1 else 0) - (if (previous == ProfileFollowState.Following) 1 else 0)
        val counts = if (isOwnProfile && previous != null) profile?.let { it.copy(followingCount = (it.followingCount + delta).coerceAtLeast(0)) } else profile
        return copy(memberFollows = memberFollows + (username to follow), profile = counts)
    }

    internal fun members(tab: ProfileConnectionsTab): ProfileMemberList =
        if (tab == ProfileConnectionsTab.Followers) followers else following

    internal fun withMembers(tab: ProfileConnectionsTab, members: ProfileMemberList): ProfileConnectionsUiState =
        if (tab == ProfileConnectionsTab.Followers) copy(followers = members) else copy(following = members)
}

data class ProfileMemberFollow(
    val followState: ProfileFollowState? = null,
    val isPrivate: Boolean = false,
    val loading: Boolean = false,
    val busy: Boolean = false,
    val loadError: ProfileLoadError? = null,
    val mutationError: ProfileLoadError? = null,
)

data class ProfileMemberList(
    val items: List<RelationActor> = emptyList(),
    val loading: Boolean = false,
    val loaded: Boolean = false,
    val error: ProfileLoadError? = null,
)

enum class ProfileConnectionsTab {
    Followers,
    Following,
}

private fun Throwable.toMemberError(): ProfileLoadError = if (this is IOException) ProfileLoadError.Offline else ProfileLoadError.Server

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
import kotlinx.io.IOException
import org.omicron.mobile.data.repository.SocialRepository
import org.omicron.mobile.domain.model.AuthenticatedSession
import org.omicron.mobile.domain.model.Profile
import org.omicron.mobile.domain.model.RelationActor

class ProfileConnectionsViewModel(
    private val repository: SocialRepository,
    username: String,
    initialTab: ProfileConnectionsTab,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    session: StateFlow<AuthenticatedSession?>? = null,
    sessionExpired: StateFlow<Boolean>? = null,
) {
    private val mutableUiState = MutableStateFlow(
        ProfileConnectionsUiState(
            username = username,
            selectedTab = initialTab,
            sessionExpired = sessionExpired?.value ?: false,
        ),
    )
    val uiState: StateFlow<ProfileConnectionsUiState> = mutableUiState.asStateFlow()
    private var profileJob: Job? = null
    private val memberJobs = mutableMapOf<ProfileConnectionsTab, Job>()
    private var viewerId = session?.value?.user?.id

    init {
        session?.let { sessions ->
            scope.launch {
                sessions.collect { current ->
                    if (viewerId != current?.user?.id) {
                        viewerId = current?.user?.id
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
        mutableUiState.update { it.copy(selectedTab = tab) }
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

    private fun loadProfile() {
        profileJob?.cancel()
        memberJobs.values.forEach(Job::cancel)
        memberJobs.clear()
        mutableUiState.update {
            it.copy(phase = ProfilePhase.Loading, profile = null, followers = ProfileMemberList(), following = ProfileMemberList())
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
) {
    val selectedMembers: ProfileMemberList get() = members(selectedTab)

    internal fun members(tab: ProfileConnectionsTab): ProfileMemberList =
        if (tab == ProfileConnectionsTab.Followers) followers else following

    internal fun withMembers(tab: ProfileConnectionsTab, members: ProfileMemberList): ProfileConnectionsUiState =
        if (tab == ProfileConnectionsTab.Followers) copy(followers = members) else copy(following = members)
}

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

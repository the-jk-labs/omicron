package org.omicron.mobile.feature.profile

import io.ktor.client.plugins.ClientRequestException
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.io.IOException
import org.omicron.mobile.data.repository.SocialRepository
import org.omicron.mobile.data.repository.TimelinePage
import org.omicron.mobile.domain.model.AuthenticatedSession
import org.omicron.mobile.domain.model.Post
import org.omicron.mobile.domain.model.Profile
import org.omicron.mobile.domain.model.ProfileFollowState
import org.omicron.mobile.domain.model.RelationActor

class ProfileViewModel(
    private val repository: SocialRepository,
    private val handle: String,
    private val remote: Boolean,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    private val session: StateFlow<AuthenticatedSession?>? = null,
    private val sessionExpired: StateFlow<Boolean>? = null,
) {
    private val mutableUiState = MutableStateFlow(
        ProfileUiState(
            signedIn = session?.value != null,
            currentUserId = session?.value?.user?.id,
            sessionExpired = sessionExpired?.value ?: false,
        ),
    )
    val uiState: StateFlow<ProfileUiState> = mutableUiState.asStateFlow()
    private val loadedRelations = mutableSetOf<ProfileTab>()
    private var relationLoadId = 0L

    init {
        session?.let { sessions ->
            scope.launch {
                sessions.collect { current ->
                    val signedIn = current != null
                    mutableUiState.update {
                        it.copy(
                            signedIn = signedIn,
                            currentUserId = current?.user?.id,
                        )
                    }
                }
            }
        }
        sessionExpired?.let { expirations ->
            scope.launch { expirations.collect { expired -> mutableUiState.update { it.copy(sessionExpired = expired) } } }
        }
        load()
    }

    fun retry() {
        when {
            mutableUiState.value.phase !is ProfilePhase.Content -> load()
            mutableUiState.value.selectedTab == ProfileTab.Followers || mutableUiState.value.selectedTab == ProfileTab.Following ->
                loadRelations(mutableUiState.value.selectedTab, force = true)
            mutableUiState.value.selectedTab == ProfileTab.Recommendations -> loadPosts(recommendations = true, cursor = null, replace = true)
            else -> loadPosts(recommendations = false, cursor = null, replace = true)
        }
    }

    fun selectTab(tab: ProfileTab) {
        if (tab == mutableUiState.value.selectedTab) return
        relationLoadId += 1
        mutableUiState.update { it.copy(selectedTab = tab, membersError = null, loadMoreError = null) }
        if (tab == ProfileTab.Followers || tab == ProfileTab.Following) {
            if (mutableUiState.value.profile?.locked == true || remote) return
            loadRelations(tab)
        }
    }

    fun loadMore() {
        val current = mutableUiState.value
        when (current.selectedTab) {
            ProfileTab.Articles -> current.articles.cursor?.let { loadPosts(false, it, replace = false) }
            ProfileTab.Recommendations -> current.recommendations.cursor?.let { loadPosts(true, it, replace = false) }
            else -> Unit
        }
    }

    fun toggleFollow() {
        val profile = mutableUiState.value.profile ?: return
        if (!mutableUiState.value.signedIn || mutableUiState.value.isSelf || mutableUiState.value.followBusy || mutableUiState.value.relationBusy) return
        val before = profile
        val desired = profile.followState != ProfileFollowState.Following && profile.followState != ProfileFollowState.Requested
        val optimisticState =
            if (!desired) {
                ProfileFollowState.None
            } else if (!remote && profile.user.isPrivate) {
                ProfileFollowState.Requested
            } else {
                ProfileFollowState.Following
            }
        mutableUiState.update {
            it.copy(
                profile = profile.withFollowState(optimisticState, profile),
                followBusy = true,
                relationError = null,
            )
        }
        scope.launch {
            try {
                val actualState = repository.setFollow(handle, remote, desired)
                mutableUiState.update { state ->
                    val current = state.profile ?: return@update state
                    state.copy(
                        profile = current.copy(followerCount = before.followerCount).withFollowState(actualState, before),
                        followBusy = false,
                    )
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Throwable) {
                mutableUiState.update { it.copy(profile = before, followBusy = false, relationError = ProfileRelationError.Follow) }
            }
        }
    }

    fun toggleMute() {
        val profile = mutableUiState.value.profile ?: return
        if (!mutableUiState.value.signedIn || mutableUiState.value.isSelf || mutableUiState.value.relationBusy || mutableUiState.value.followBusy) return
        setRelation(profile, ProfileRelation.Mute, !profile.isMuted)
    }

    fun toggleBlock() {
        val profile = mutableUiState.value.profile ?: return
        if (!mutableUiState.value.signedIn || mutableUiState.value.isSelf || mutableUiState.value.relationBusy || mutableUiState.value.followBusy) return
        setRelation(profile, ProfileRelation.Block, !profile.isBlocked)
    }

    fun close() {
        scope.cancel()
    }

    private fun load() {
        scope.launch {
            mutableUiState.update { it.copy(phase = ProfilePhase.Loading) }
            try {
                val profile = repository.profile(handle, remote)
                mutableUiState.update { it.copy(profile = profile, phase = ProfilePhase.Content) }
                if (!profile.locked) {
                    loadPosts(recommendations = false, cursor = null, replace = true)
                    loadPosts(recommendations = true, cursor = null, replace = true)
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (exception: Throwable) {
                mutableUiState.update { it.copy(phase = exception.toProfilePhase()) }
            }
        }
    }

    private fun loadPosts(
        recommendations: Boolean,
        cursor: String?,
        replace: Boolean,
    ) {
        scope.launch {
            mutableUiState.update {
                it.copy(
                    articles = if (!recommendations && replace) ProfilePostList(loading = true) else it.articles.copy(loading = true, error = null),
                    recommendations =
                        if (recommendations && replace) ProfilePostList(loading = true)
                        else it.recommendations.copy(loading = true, error = null),
                    loadMoreError = null,
                )
            }
            try {
                val page = repository.profilePosts(handle, remote, recommendations, cursor)
                mutableUiState.update { state ->
                    val previous = if (recommendations) state.recommendations else state.articles
                    val next = previous.withPage(page, replace)
                    if (recommendations) state.copy(recommendations = next) else state.copy(articles = next)
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Throwable) {
                mutableUiState.update {
                    if (replace) {
                        if (recommendations) it.copy(recommendations = it.recommendations.copy(loading = false, error = ProfileContentError.Load))
                        else it.copy(articles = it.articles.copy(loading = false, error = ProfileContentError.Load))
                    } else {
                        if (recommendations) it.copy(recommendations = it.recommendations.copy(loading = false), loadMoreError = ProfileContentError.Load)
                        else it.copy(articles = it.articles.copy(loading = false), loadMoreError = ProfileContentError.Load)
                    }
                }
            }
        }
    }

    private fun loadRelations(
        tab: ProfileTab,
        force: Boolean = false,
    ) {
        if (!force && tab in loadedRelations) return
        val requestId = ++relationLoadId
        scope.launch {
            mutableUiState.update { it.copy(membersLoading = true, membersError = null, members = emptyList()) }
            try {
                val actors = repository.profileRelations(handle, following = tab == ProfileTab.Following)
                if (requestId != relationLoadId || mutableUiState.value.selectedTab != tab) return@launch
                loadedRelations += tab
                mutableUiState.update { it.copy(members = actors, membersLoading = false) }
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Throwable) {
                if (requestId == relationLoadId && mutableUiState.value.selectedTab == tab) {
                    mutableUiState.update { it.copy(membersLoading = false, membersError = ProfileContentError.Load) }
                }
            }
        }
    }

    private fun setRelation(
        before: Profile,
        relation: ProfileRelation,
        enabled: Boolean,
    ) {
        mutableUiState.update {
            it.copy(
                profile =
                    when (relation) {
                        ProfileRelation.Mute -> before.copy(isMuted = enabled)
                        ProfileRelation.Block ->
                            if (enabled) {
                                before.copy(isBlocked = true).withFollowState(ProfileFollowState.None, before)
                            } else {
                                before.copy(isBlocked = false)
                            }
                    },
                relationBusy = true,
                relationError = null,
            )
        }
        scope.launch {
            try {
                when (relation) {
                    ProfileRelation.Mute -> repository.setMuted(handle, remote, enabled)
                    ProfileRelation.Block -> repository.setBlocked(handle, remote, enabled)
                }
                mutableUiState.update { it.copy(relationBusy = false) }
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Throwable) {
                mutableUiState.update {
                    it.copy(
                        profile = before,
                        relationBusy = false,
                        relationError = if (relation == ProfileRelation.Mute) ProfileRelationError.Mute else ProfileRelationError.Block,
                    )
                }
            }
        }
    }
}

data class ProfileUiState(
    val phase: ProfilePhase = ProfilePhase.Loading,
    val profile: Profile? = null,
    val selectedTab: ProfileTab = ProfileTab.Articles,
    val articles: ProfilePostList = ProfilePostList(),
    val recommendations: ProfilePostList = ProfilePostList(),
    val members: List<RelationActor> = emptyList(),
    val membersLoading: Boolean = false,
    val membersError: ProfileContentError? = null,
    val loadMoreError: ProfileContentError? = null,
    val signedIn: Boolean = false,
    val currentUserId: String? = null,
    val sessionExpired: Boolean = false,
    val followBusy: Boolean = false,
    val relationBusy: Boolean = false,
    val relationError: ProfileRelationError? = null,
) {
    val isSelf: Boolean get() = profile?.user?.id == currentUserId && currentUserId != null
}

data class ProfilePostList(
    val posts: List<Post> = emptyList(),
    val cursor: String? = null,
    val loading: Boolean = false,
    val error: ProfileContentError? = null,
)

sealed interface ProfilePhase {
    data object Loading : ProfilePhase

    data object Content : ProfilePhase

    data object NotFound : ProfilePhase

    data class Error(val reason: ProfileLoadError) : ProfilePhase
}

enum class ProfileTab {
    Articles,
    Recommendations,
    Followers,
    Following,
    About,
}

enum class ProfileLoadError {
    Offline,
    Server,
}

enum class ProfileContentError {
    Load,
}

enum class ProfileRelationError {
    Follow,
    Mute,
    Block,
}

private enum class ProfileRelation {
    Mute,
    Block,
}

private fun Profile.withFollowState(
    next: ProfileFollowState,
    previous: Profile? = null,
): Profile {
    val previousFollowing = previous?.isFollowing ?: isFollowing
    val nextFollowing = next == ProfileFollowState.Following
    val countDelta = if (previous == null) 0 else (if (nextFollowing) 1 else 0) - (if (previousFollowing) 1 else 0)
    return copy(
        followState = next,
        isFollowing = nextFollowing,
        followerCount = (followerCount + countDelta).coerceAtLeast(0),
    )
}

private fun ProfilePostList.withPage(page: TimelinePage, replace: Boolean): ProfilePostList =
    copy(
        posts = if (replace) page.items else posts + page.items.filterNot { item -> posts.any { it.id == item.id } },
        cursor = page.nextCursor,
        loading = false,
        error = null,
    )

private fun Throwable.toProfilePhase(): ProfilePhase =
    when {
        this is ClientRequestException && response.status == HttpStatusCode.NotFound -> ProfilePhase.NotFound
        this is IOException -> ProfilePhase.Error(ProfileLoadError.Offline)
        else -> ProfilePhase.Error(ProfileLoadError.Server)
    }

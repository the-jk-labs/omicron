package org.omicron.mobile.feature.reader

import kotlinx.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.flow.updateAndGet
import kotlinx.coroutines.launch
import org.omicron.mobile.data.repository.SocialRepository
import org.omicron.mobile.data.api.TimelineScope
import org.omicron.mobile.data.repository.MissingInstanceException
import org.omicron.mobile.data.repository.PostsRepository
import org.omicron.mobile.data.repository.TimelinePage
import org.omicron.mobile.data.repository.UnauthorizedException
import org.omicron.mobile.data.repository.SessionRefreshState
import org.omicron.mobile.data.repository.ReadingAccessDeniedException
import org.omicron.mobile.domain.model.AuthenticatedSession
import org.omicron.mobile.domain.model.AuthenticatedUser
import org.omicron.mobile.domain.model.HomeSnapshot
import org.omicron.mobile.domain.model.Post

class TimelineViewModel(
    private val repository: PostsRepository,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    private val session: StateFlow<AuthenticatedSession?>? = null,
    private val sessionExpired: StateFlow<Boolean>? = null,
    private val socialRepository: SocialRepository? = null,
    private val account: StateFlow<AuthenticatedUser?>? = null,
    private val sessionRefresh: StateFlow<SessionRefreshState>? = null,
    initialHome: HomeSnapshot? = null,
) {
    private val mutableUiState = MutableStateFlow(TimelineUiState())
    val uiState: StateFlow<TimelineUiState> = mutableUiState.asStateFlow()
    private var scopeSelectedByUser = false
    private var loadJob: Job? = null
    private var paginationJob: Job? = null
    private val loadGeneration = MutableStateFlow(0L)

    init {
        val initialUser = account?.value ?: session?.value?.user
        val refreshState = sessionRefresh?.value ?: SessionRefreshState.Ready
        val signedIn = initialUser != null || refreshState != SessionRefreshState.Ready
        val snapshot = initialHome?.takeIf { it.user?.id == initialUser?.id }
        val cachedScope = snapshot?.scope?.let { name -> TimelineScope.entries.find { it.name == name } }
        val initialScope = cachedScope?.takeIf { it != TimelineScope.ForYou || signedIn }
            ?: if (signedIn) TimelineScope.ForYou else TimelineScope.Global
        val hasCachedPage = snapshot?.postsUpdatedAtMillis != null
        scopeSelectedByUser = hasCachedPage
        mutableUiState.update {
            it.copy(
                scope = initialScope,
                signedIn = signedIn,
                username = initialUser?.username,
                accountId = initialUser?.id,
                sessionExpired = sessionExpired?.value ?: false,
                posts = if (hasCachedPage) snapshot.posts else emptyList(),
                phase = if (!hasCachedPage) TimelinePhase.Loading else if (snapshot.posts.isEmpty()) TimelinePhase.Empty else TimelinePhase.Content,
                isCachedContent = hasCachedPage,
                canInteract = !signedIn || (session?.value != null && refreshState == SessionRefreshState.Ready && !hasCachedPage),
            )
        }
        if (session != null || account != null || sessionRefresh != null) {
            scope.launch {
                val sessions = session ?: MutableStateFlow<AuthenticatedSession?>(null)
                val users = account ?: sessions.map { it?.user }
                val refreshes = sessionRefresh ?: MutableStateFlow(SessionRefreshState.Ready)
                var wasSignedIn = signedIn
                var previousUserId = initialUser?.id
                var previousRefresh = refreshState
                combine(sessions, users, refreshes) { current, user, refresh -> Triple(current, user, refresh) }.collect { (current, user, refresh) ->
                    val nowSignedIn = user != null || refresh != SessionRefreshState.Ready
                    val identityChanged = previousUserId != user?.id || wasSignedIn != nowSignedIn
                    val recovered = previousRefresh == SessionRefreshState.Unavailable && refresh == SessionRefreshState.Ready
                    previousUserId = user?.id
                    previousRefresh = refresh
                    if (!identityChanged) mutableUiState.update {
                        it.copy(
                            signedIn = nowSignedIn,
                            username = user?.username,
                            accountId = user?.id,
                            canInteract = !nowSignedIn || (current != null && refresh == SessionRefreshState.Ready && !it.isCachedContent),
                        )
                    }
                    if (identityChanged) {
                        wasSignedIn = nowSignedIn
                        if (!nowSignedIn) scopeSelectedByUser = false
                        val selectedScope = if (!nowSignedIn && mutableUiState.value.scope == TimelineScope.ForYou) TimelineScope.Global
                            else if (nowSignedIn && !scopeSelectedByUser) TimelineScope.ForYou else mutableUiState.value.scope
                        mutableUiState.update {
                            it.copy(
                                signedIn = nowSignedIn, username = user?.username, accountId = user?.id,
                                canInteract = !nowSignedIn || (current != null && refresh == SessionRefreshState.Ready),
                                scope = selectedScope, posts = emptyList(), nextCursor = null, isCachedContent = false,
                                phase = TimelinePhase.Loading, savedPostIds = emptySet(), likeBusyPostIds = emptySet(),
                                recommendationBusyPostIds = emptySet(), saveBusyPostIds = emptySet(), actionErrorPostIds = emptySet(),
                            )
                        }
                        loadInitial()
                    } else if (recovered && loadJob?.isActive != true) {
                        loadInitial()
                    }
                }
            }
        }
        sessionExpired?.let { expirations ->
            scope.launch { expirations.collect { expired -> mutableUiState.update { it.copy(sessionExpired = expired) } } }
        }
        loadInitial()
    }

    fun selectScope(scope: TimelineScope) {
        if (scope == mutableUiState.value.scope) return
        scopeSelectedByUser = true
        mutableUiState.update { it.copy(scope = scope, posts = emptyList(), nextCursor = null, phase = TimelinePhase.Loading, isCachedContent = false) }
        loadInitial()
    }

    fun refresh() {
        loadInitial()
    }

    fun retry() {
        loadInitial()
    }

    fun loadMore() {
        val current = mutableUiState.value
        val cursor = current.nextCursor ?: return
        if (current.phase !is TimelinePhase.Content || current.isLoadingMore || current.isRefreshing) return
        val generation = loadGeneration.value
        paginationJob = scope.launch {
            mutableUiState.update { it.copy(isLoadingMore = true, loadMoreError = null) }
            runCatching { loadPage(current.scope, cursor) }
                .onSuccess { page ->
                    if (generation != loadGeneration.value) return@onSuccess
                    mutableUiState.update {
                        val knownIds = it.posts.map(Post::id).toSet()
                        it.copy(
                            posts = it.posts + page.items.filterNot { item -> current.scope == TimelineScope.ForYou && item.id in knownIds },
                            nextCursor = page.nextCursor,
                            isLoadingMore = false,
                        )
                    }
                }.onFailure { error ->
                    if (error is CancellationException) throw error
                    if (generation != loadGeneration.value) return@onFailure
                    if (error is ReadingAccessDeniedException) {
                        mutableUiState.update {
                            it.copy(posts = emptyList(), nextCursor = null, isLoadingMore = false, phase = TimelinePhase.Error(TimelineError.Forbidden), canInteract = false, isCachedContent = false)
                        }
                        return@onFailure
                    }
                    mutableUiState.update { it.copy(isLoadingMore = false, loadMoreError = error.toTimelineError()) }
                }
        }
    }

    fun toggleLike(postId: String) {
        val repository = socialRepository ?: return
        val current = mutableUiState.value
        val post = current.posts.firstOrNull { it.id == postId } ?: return
        if (!current.signedIn || !current.canInteract || current.isRefreshing || postId in current.likeBusyPostIds) return
        val owner = session?.value?.user?.id ?: return
        val desired = !post.liked
        mutableUiState.update {
            it.copy(
                posts = it.posts.updatePost(postId) { item ->
                    item.copy(liked = desired, likeCount = (item.likeCount + if (desired) 1 else -1).coerceAtLeast(0))
                },
                likeBusyPostIds = it.likeBusyPostIds + postId,
                actionErrorPostIds = it.actionErrorPostIds - postId,
            )
        }
        scope.launch {
            if (session.value?.user?.id != owner) return@launch
            try {
                val result = repository.setPostLike(postId, desired)
                if (session.value?.user?.id != owner) return@launch
                mutableUiState.update {
                    it.copy(
                        posts = it.posts.updatePost(postId) { item -> item.copy(liked = result.active, likeCount = result.count) },
                        likeBusyPostIds = it.likeBusyPostIds - postId,
                    )
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Throwable) {
                if (session.value?.user?.id != owner) return@launch
                mutableUiState.update {
                    it.copy(
                        posts = it.posts.updatePost(postId) { item -> item.copy(liked = post.liked, likeCount = post.likeCount) },
                        likeBusyPostIds = it.likeBusyPostIds - postId,
                        actionErrorPostIds = it.actionErrorPostIds + postId,
                    )
                }
            }
        }
    }

    fun toggleRecommendation(postId: String) {
        val repository = socialRepository ?: return
        val current = mutableUiState.value
        val post = current.posts.firstOrNull { it.id == postId } ?: return
        if (!current.signedIn || !current.canInteract || current.isRefreshing || postId in current.recommendationBusyPostIds) return
        val owner = session?.value?.user?.id ?: return
        val desired = !post.recommended
        mutableUiState.update {
            it.copy(
                posts = it.posts.updatePost(postId) { item ->
                    item.copy(
                        recommended = desired,
                        recommendCount = (item.recommendCount + if (desired) 1 else -1).coerceAtLeast(0),
                    )
                },
                recommendationBusyPostIds = it.recommendationBusyPostIds + postId,
                actionErrorPostIds = it.actionErrorPostIds - postId,
            )
        }
        scope.launch {
            if (session.value?.user?.id != owner) return@launch
            try {
                val result = repository.setPostRecommendation(postId, desired)
                if (session.value?.user?.id != owner) return@launch
                mutableUiState.update {
                    it.copy(
                        posts = it.posts.updatePost(postId) { item ->
                            item.copy(recommended = result.active, recommendCount = result.count)
                        },
                        recommendationBusyPostIds = it.recommendationBusyPostIds - postId,
                    )
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Throwable) {
                if (session.value?.user?.id != owner) return@launch
                mutableUiState.update {
                    it.copy(
                        posts = it.posts.updatePost(postId) { item -> item.copy(recommended = post.recommended, recommendCount = post.recommendCount) },
                        recommendationBusyPostIds = it.recommendationBusyPostIds - postId,
                        actionErrorPostIds = it.actionErrorPostIds + postId,
                    )
                }
            }
        }
    }

    fun toggleReadLater(postId: String) {
        val repository = socialRepository ?: return
        val current = mutableUiState.value
        if (!current.signedIn || !current.canInteract || current.isRefreshing || postId in current.saveBusyPostIds || current.posts.none { it.id == postId }) return
        val owner = session?.value?.user?.id ?: return
        val savedBefore = postId in current.savedPostIds
        var persistedSavedBefore = savedBefore
        mutableUiState.update {
            it.copy(saveBusyPostIds = it.saveBusyPostIds + postId, actionErrorPostIds = it.actionErrorPostIds - postId)
        }
        scope.launch {
            if (session.value?.user?.id != owner) return@launch
            try {
                val readLater = repository.readLaterState(postId)
                if (session.value?.user?.id != owner) return@launch
                persistedSavedBefore = readLater.saved
                val desired = !readLater.saved
                mutableUiState.update {
                    it.copy(
                        savedPostIds = if (desired) it.savedPostIds + postId else it.savedPostIds - postId,
                    )
                }
                repository.setReadLater(postId, readLater.listId, desired)
                if (session.value?.user?.id != owner) return@launch
                mutableUiState.update { it.copy(saveBusyPostIds = it.saveBusyPostIds - postId) }
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Throwable) {
                if (session.value?.user?.id != owner) return@launch
                mutableUiState.update {
                    it.copy(
                        savedPostIds = if (persistedSavedBefore) it.savedPostIds + postId else it.savedPostIds - postId,
                        saveBusyPostIds = it.saveBusyPostIds - postId,
                        actionErrorPostIds = it.actionErrorPostIds + postId,
                    )
                }
            }
        }
    }

    fun close() {
        scope.cancel()
    }

    private fun loadInitial() {
        val scopeValue = mutableUiState.value.scope
        val generation = loadGeneration.updateAndGet { it + 1 }
        loadJob?.cancel()
        paginationJob?.cancel()
        loadJob = scope.launch {
            mutableUiState.update {
                it.copy(
                    phase = if (it.posts.isNotEmpty() || it.phase == TimelinePhase.Empty) it.phase else TimelinePhase.Loading,
                    isRefreshing = true, refreshError = null, isLoadingMore = false, loadMoreError = null,
                )
            }
            runCatching { loadPage(scopeValue, null) }
                .onSuccess { page ->
                    if (generation != loadGeneration.value) return@onSuccess
                    mutableUiState.update {
                        it.copy(
                            posts = page.items,
                            nextCursor = page.nextCursor,
                            phase = if (page.items.isEmpty()) TimelinePhase.Empty else TimelinePhase.Content,
                            isRefreshing = false,
                            isCachedContent = false,
                            canInteract = !it.signedIn || (session?.value != null && (sessionRefresh?.value ?: SessionRefreshState.Ready) == SessionRefreshState.Ready),
                        )
                    }
                }.onFailure { error ->
                    if (error is CancellationException) throw error
                    if (generation != loadGeneration.value) return@onFailure
                    if (error is UnauthorizedException && scopeValue == TimelineScope.ForYou && session?.value == null) {
                        scopeSelectedByUser = false
                        mutableUiState.update { it.copy(scope = TimelineScope.Global) }
                        loadInitial()
                    } else {
                        mutableUiState.update {
                            val retained = error !is ReadingAccessDeniedException && (it.posts.isNotEmpty() || it.phase == TimelinePhase.Empty)
                            it.copy(
                                posts = if (retained) it.posts else emptyList(),
                                nextCursor = null,
                                phase = if (retained) it.phase else TimelinePhase.Error(error.toTimelineError()),
                                isRefreshing = false,
                                isCachedContent = retained && it.isCachedContent,
                                refreshError = error.toTimelineError(),
                            )
                        }
                    }
                }
        }
    }

    private suspend fun loadPage(
        scope: TimelineScope,
        cursor: String?,
    ): TimelinePage =
        if (scope == TimelineScope.ForYou) {
            repository.feed(cursor)
        } else {
            repository.timeline(scope, cursor)
        }
}

data class TimelineUiState(
    val scope: TimelineScope = TimelineScope.Global,
    val signedIn: Boolean = false,
    val username: String? = null,
    val accountId: String? = null,
    val sessionExpired: Boolean = false,
    val posts: List<Post> = emptyList(),
    val nextCursor: String? = null,
    val phase: TimelinePhase = TimelinePhase.Loading,
    val isLoadingMore: Boolean = false,
    val loadMoreError: TimelineError? = null,
    val savedPostIds: Set<String> = emptySet(),
    val likeBusyPostIds: Set<String> = emptySet(),
    val recommendationBusyPostIds: Set<String> = emptySet(),
    val saveBusyPostIds: Set<String> = emptySet(),
    val actionErrorPostIds: Set<String> = emptySet(),
    val isRefreshing: Boolean = false,
    val isCachedContent: Boolean = false,
    val canInteract: Boolean = true,
    val refreshError: TimelineError? = null,
    val canRefresh: Boolean = true,
)

sealed interface TimelinePhase {
    data object Loading : TimelinePhase

    data object Content : TimelinePhase

    data object Empty : TimelinePhase

    data object WaitingForSession : TimelinePhase

    data class Error(
        val error: TimelineError,
    ) : TimelinePhase
}

enum class TimelineError {
    Offline,
    Server,
    MissingInstance,
    Forbidden,
}

private fun Throwable.toTimelineError(): TimelineError =
    when {
        this is MissingInstanceException -> TimelineError.MissingInstance
        this is ReadingAccessDeniedException -> TimelineError.Forbidden
        this is IOException -> TimelineError.Offline
        else -> TimelineError.Server
    }

private inline fun List<Post>.updatePost(
    id: String,
    transform: (Post) -> Post,
): List<Post> = map { post -> if (post.id == id) transform(post) else post }

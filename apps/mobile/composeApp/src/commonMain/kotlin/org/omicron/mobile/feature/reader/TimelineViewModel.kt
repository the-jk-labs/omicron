package org.omicron.mobile.feature.reader

import kotlinx.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.omicron.mobile.data.api.TimelineScope
import org.omicron.mobile.data.repository.MissingInstanceException
import org.omicron.mobile.data.repository.PostsRepository
import org.omicron.mobile.data.repository.TimelinePage
import org.omicron.mobile.data.repository.UnauthorizedException
import org.omicron.mobile.domain.model.AuthenticatedSession
import org.omicron.mobile.domain.model.Post

class TimelineViewModel(
    private val repository: PostsRepository,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    private val session: StateFlow<AuthenticatedSession?>? = null,
    private val sessionExpired: StateFlow<Boolean>? = null,
) {
    private val mutableUiState = MutableStateFlow(TimelineUiState())
    val uiState: StateFlow<TimelineUiState> = mutableUiState.asStateFlow()
    private var scopeSelectedByUser = false

    init {
        val signedIn = session?.value != null
        mutableUiState.update {
            it.copy(
                scope = if (signedIn) TimelineScope.ForYou else TimelineScope.Global,
                signedIn = signedIn,
                username = session?.value?.user?.username,
                sessionExpired = sessionExpired?.value ?: false,
            )
        }
        session?.let { sessions ->
            scope.launch {
                var wasSignedIn = signedIn
                sessions.collect { current ->
                    val nowSignedIn = current != null
                    mutableUiState.update { it.copy(signedIn = nowSignedIn, username = current?.user?.username) }
                    if (nowSignedIn == wasSignedIn) return@collect
                    wasSignedIn = nowSignedIn
                    if (nowSignedIn && !scopeSelectedByUser && mutableUiState.value.scope != TimelineScope.ForYou) {
                        mutableUiState.update { it.copy(scope = TimelineScope.ForYou) }
                        loadInitial()
                    } else if (!nowSignedIn && mutableUiState.value.scope == TimelineScope.ForYou) {
                        scopeSelectedByUser = false
                        mutableUiState.update { it.copy(scope = TimelineScope.Global) }
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
        mutableUiState.update { it.copy(scope = scope) }
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
        if (current.phase !is TimelinePhase.Content || current.isLoadingMore) return
        scope.launch {
            mutableUiState.update { it.copy(isLoadingMore = true, loadMoreError = null) }
            runCatching { loadPage(current.scope, cursor) }
                .onSuccess { page ->
                    mutableUiState.update {
                        val knownIds = it.posts.map(Post::id).toSet()
                        it.copy(
                            posts = it.posts + page.items.filterNot { item -> current.scope == TimelineScope.ForYou && item.id in knownIds },
                            nextCursor = page.nextCursor,
                            isLoadingMore = false,
                        )
                    }
                }.onFailure { error ->
                    mutableUiState.update { it.copy(isLoadingMore = false, loadMoreError = error.toTimelineError()) }
                }
        }
    }

    fun close() {
        scope.cancel()
    }

    private fun loadInitial() {
        val scopeValue = mutableUiState.value.scope
        scope.launch {
            mutableUiState.update {
                it.copy(phase = TimelinePhase.Loading, isLoadingMore = false, loadMoreError = null)
            }
            runCatching { loadPage(scopeValue, null) }
                .onSuccess { page ->
                    mutableUiState.update {
                        it.copy(
                            posts = page.items,
                            nextCursor = page.nextCursor,
                            phase = if (page.items.isEmpty()) TimelinePhase.Empty else TimelinePhase.Content,
                        )
                    }
                }.onFailure { error ->
                    if (error is UnauthorizedException && scopeValue == TimelineScope.ForYou && session?.value == null) {
                        scopeSelectedByUser = false
                        mutableUiState.update { it.copy(scope = TimelineScope.Global) }
                        loadInitial()
                    } else {
                        mutableUiState.update {
                            it.copy(
                                posts = emptyList(),
                                nextCursor = null,
                                phase = TimelinePhase.Error(error.toTimelineError()),
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
    val sessionExpired: Boolean = false,
    val posts: List<Post> = emptyList(),
    val nextCursor: String? = null,
    val phase: TimelinePhase = TimelinePhase.Loading,
    val isLoadingMore: Boolean = false,
    val loadMoreError: TimelineError? = null,
)

sealed interface TimelinePhase {
    data object Loading : TimelinePhase

    data object Content : TimelinePhase

    data object Empty : TimelinePhase

    data class Error(
        val error: TimelineError,
    ) : TimelinePhase
}

enum class TimelineError {
    Offline,
    Server,
    MissingInstance,
}

private fun Throwable.toTimelineError(): TimelineError =
    when {
        this is MissingInstanceException -> TimelineError.MissingInstance
        this is IOException -> TimelineError.Offline
        else -> TimelineError.Server
    }

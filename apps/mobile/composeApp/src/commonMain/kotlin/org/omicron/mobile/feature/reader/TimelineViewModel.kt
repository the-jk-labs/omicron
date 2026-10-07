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
import org.omicron.mobile.domain.model.Post

class TimelineViewModel(
    private val repository: PostsRepository,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
) {
    private val mutableUiState = MutableStateFlow(TimelineUiState())
    val uiState: StateFlow<TimelineUiState> = mutableUiState.asStateFlow()

    init {
        loadInitial()
    }

    fun selectScope(scope: TimelineScope) {
        if (scope == mutableUiState.value.scope) return
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
            runCatching { repository.timeline(current.scope, cursor) }
                .onSuccess { page ->
                    mutableUiState.update {
                        it.copy(
                            posts = it.posts + page.items,
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
            runCatching { repository.timeline(scopeValue, null) }
                .onSuccess { page ->
                    mutableUiState.update {
                        it.copy(
                            posts = page.items,
                            nextCursor = page.nextCursor,
                            phase = if (page.items.isEmpty()) TimelinePhase.Empty else TimelinePhase.Content,
                        )
                    }
                }.onFailure { error ->
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

data class TimelineUiState(
    val scope: TimelineScope = TimelineScope.Global,
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

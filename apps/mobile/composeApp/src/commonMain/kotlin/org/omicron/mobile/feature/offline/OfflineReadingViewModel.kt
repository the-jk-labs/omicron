package org.omicron.mobile.feature.offline

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
import org.omicron.mobile.data.repository.MissingInstanceException
import org.omicron.mobile.data.repository.PostsRepository
import org.omicron.mobile.domain.model.OfflinePostSummary

class OfflineReadingViewModel(
    private val postsRepository: PostsRepository,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
) {
    private val mutableUiState = MutableStateFlow(OfflineReadingUiState())
    val uiState: StateFlow<OfflineReadingUiState> = mutableUiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        scope.launch {
            mutableUiState.update { it.copy(phase = OfflineReadingPhase.Loading, error = null) }
            runCatching { postsRepository.offlinePosts() }
                .onSuccess { posts ->
                    mutableUiState.update { it.copy(posts = posts, phase = OfflineReadingPhase.Content) }
                }.onFailure { error ->
                    if (error is CancellationException) throw error
                    mutableUiState.update { it.copy(phase = OfflineReadingPhase.Error(error.toOfflineReadingError())) }
                }
        }
    }

    fun remove(postId: String) {
        if (mutableUiState.value.isMutating) return
        scope.launch {
            mutableUiState.update { it.copy(isMutating = true, error = null) }
            runCatching {
                postsRepository.removeOfflinePost(postId)
                postsRepository.offlinePosts()
            }.onSuccess { posts ->
                mutableUiState.update { it.copy(posts = posts, isMutating = false) }
            }.onFailure { error ->
                if (error is CancellationException) throw error
                mutableUiState.update { it.copy(isMutating = false, error = error.toOfflineReadingError()) }
            }
        }
    }

    fun clear() {
        if (mutableUiState.value.isMutating) return
        scope.launch {
            mutableUiState.update { it.copy(isMutating = true, error = null) }
            runCatching {
                postsRepository.clearOfflinePosts()
                postsRepository.offlinePosts()
            }.onSuccess { posts ->
                mutableUiState.update { it.copy(posts = posts, isMutating = false) }
            }.onFailure { error ->
                if (error is CancellationException) throw error
                mutableUiState.update { it.copy(isMutating = false, error = error.toOfflineReadingError()) }
            }
        }
    }

    fun close() {
        scope.cancel()
    }
}

data class OfflineReadingUiState(
    val posts: List<OfflinePostSummary> = emptyList(),
    val phase: OfflineReadingPhase = OfflineReadingPhase.Loading,
    val error: OfflineReadingError? = null,
    val isMutating: Boolean = false,
)

sealed interface OfflineReadingPhase {
    data object Loading : OfflineReadingPhase

    data object Content : OfflineReadingPhase

    data class Error(val error: OfflineReadingError) : OfflineReadingPhase
}

enum class OfflineReadingError {
    MissingInstance,
    Storage,
}

private fun Throwable.toOfflineReadingError(): OfflineReadingError =
    when (this) {
        is MissingInstanceException -> OfflineReadingError.MissingInstance
        is IOException -> OfflineReadingError.Storage
        else -> OfflineReadingError.Storage
    }

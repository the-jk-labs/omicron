package org.omicron.mobile.feature.notifications

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
import org.omicron.mobile.data.repository.MobileWebRepository
import org.omicron.mobile.domain.model.MobileNotification
import org.omicron.mobile.feature.common.MobileFeatureError
import org.omicron.mobile.feature.common.toMobileFeatureError

class NotificationsViewModel(
    private val repository: MobileWebRepository,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
) {
    private val mutableUiState = MutableStateFlow(NotificationsUiState())
    val uiState: StateFlow<NotificationsUiState> = mutableUiState.asStateFlow()
    private var generation = 0

    fun loadIfNeeded() {
        if (mutableUiState.value.phase == NotificationsPhase.NotLoaded) load()
    }

    fun refresh() = load()

    fun retry() = load()

    fun loadMore() {
        val cursor = mutableUiState.value.nextCursor ?: return
        if (mutableUiState.value.isLoadingMore) return
        val requestGeneration = generation
        mutableUiState.update { it.copy(isLoadingMore = true, loadMoreError = null) }
        scope.launch {
            try {
                val page = repository.notifications(cursor)
                if (requestGeneration != generation) return@launch
                mutableUiState.update {
                    it.copy(items = it.items + page.items, nextCursor = page.nextCursor, isLoadingMore = false)
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (exception: Throwable) {
                if (requestGeneration != generation) return@launch
                mutableUiState.update { it.copy(isLoadingMore = false, loadMoreError = exception.toMobileFeatureError()) }
            }
        }
    }

    fun refreshUnreadCount() {
        val requestGeneration = generation
        scope.launch {
            try {
                val count = repository.unreadNotificationCount()
                if (requestGeneration == generation) mutableUiState.update { it.copy(unreadCount = count) }
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Throwable) { }
        }
    }

    fun clearForSignOut() {
        generation += 1
        mutableUiState.value = NotificationsUiState()
    }

    fun retryMarkAllRead() {
        markAllRead()
    }

    fun close() {
        scope.cancel()
    }

    private fun load() {
        if (mutableUiState.value.isLoading) return
        val requestGeneration = ++generation
        mutableUiState.update { it.copy(phase = NotificationsPhase.Loading, isLoading = true, error = null, markReadError = false) }
        scope.launch {
            try {
                val page = repository.notifications(null)
                if (requestGeneration != generation) return@launch
                mutableUiState.update {
                    it.copy(
                        items = page.items,
                        nextCursor = page.nextCursor,
                        phase = if (page.items.isEmpty()) NotificationsPhase.Empty else NotificationsPhase.Content,
                        isLoading = false,
                    )
                }
                if (page.items.any { !it.read } || mutableUiState.value.unreadCount > 0) markAllRead(requestGeneration)
            } catch (exception: CancellationException) {
                throw exception
            } catch (exception: Throwable) {
                if (requestGeneration != generation) return@launch
                mutableUiState.update {
                    it.copy(phase = NotificationsPhase.Error, error = exception.toMobileFeatureError(), isLoading = false)
                }
            }
        }
    }

    private fun markAllRead(requestGeneration: Int = generation) {
        scope.launch {
            try {
                repository.markAllNotificationsRead()
                if (requestGeneration != generation) return@launch
                mutableUiState.update { it.copy(unreadCount = 0, markReadError = false) }
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Throwable) {
                if (requestGeneration != generation) return@launch
                mutableUiState.update { it.copy(markReadError = true) }
            }
        }
    }
}

data class NotificationsUiState(
    val items: List<MobileNotification> = emptyList(),
    val nextCursor: String? = null,
    val phase: NotificationsPhase = NotificationsPhase.NotLoaded,
    val error: MobileFeatureError? = null,
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val loadMoreError: MobileFeatureError? = null,
    val unreadCount: Int = 0,
    val markReadError: Boolean = false,
)

enum class NotificationsPhase {
    NotLoaded,
    Loading,
    Content,
    Empty,
    Error,
}

package org.omicron.mobile.feature.lists

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
import org.omicron.mobile.domain.model.Post
import org.omicron.mobile.domain.model.ReadingListDetail
import org.omicron.mobile.feature.common.MobileFeatureError
import org.omicron.mobile.feature.common.toMobileFeatureError

class ListDetailViewModel(
    private val listId: String,
    private val repository: MobileWebRepository,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
) {
    private val mutableUiState = MutableStateFlow(ListDetailUiState())
    val uiState: StateFlow<ListDetailUiState> = mutableUiState.asStateFlow()

    init {
        load()
    }

    fun retry() = load()

    fun loadMore() {
        val cursor = mutableUiState.value.nextCursor ?: return
        if (mutableUiState.value.isLoadingMore) return
        mutableUiState.update { it.copy(isLoadingMore = true, loadMoreError = null) }
        scope.launch {
            try {
                val page = repository.listItems(listId, cursor)
                mutableUiState.update { it.copy(posts = it.posts + page.items, nextCursor = page.nextCursor, isLoadingMore = false) }
            } catch (exception: CancellationException) {
                throw exception
            } catch (exception: Throwable) {
                mutableUiState.update { it.copy(isLoadingMore = false, loadMoreError = exception.toMobileFeatureError()) }
            }
        }
    }

    fun close() {
        scope.cancel()
    }

    private fun load() {
        if (mutableUiState.value.isLoading) return
        mutableUiState.update { it.copy(isLoading = true, error = null) }
        scope.launch {
            try {
                val detail = repository.listDetail(listId)
                val page = repository.listItems(listId, null)
                mutableUiState.update {
                    it.copy(
                        detail = detail,
                        posts = page.items,
                        nextCursor = page.nextCursor,
                        phase = if (page.items.isEmpty()) ListDetailPhase.Empty else ListDetailPhase.Content,
                        isLoading = false,
                    )
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (exception: Throwable) {
                mutableUiState.update {
                    it.copy(phase = ListDetailPhase.Error, error = exception.toMobileFeatureError(), isLoading = false)
                }
            }
        }
    }
}

data class ListDetailUiState(
    val detail: ReadingListDetail? = null,
    val posts: List<Post> = emptyList(),
    val nextCursor: String? = null,
    val phase: ListDetailPhase = ListDetailPhase.Loading,
    val error: MobileFeatureError? = null,
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val loadMoreError: MobileFeatureError? = null,
)

enum class ListDetailPhase {
    Loading,
    Content,
    Empty,
    Error,
}

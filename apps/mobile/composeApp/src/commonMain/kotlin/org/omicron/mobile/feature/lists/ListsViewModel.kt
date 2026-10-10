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
import org.omicron.mobile.domain.model.ReadingList
import org.omicron.mobile.feature.common.MobileFeatureError
import org.omicron.mobile.feature.common.toMobileFeatureError

class ListsViewModel(
    private val repository: MobileWebRepository,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
) {
    private val mutableUiState = MutableStateFlow(ListsUiState())
    val uiState: StateFlow<ListsUiState> = mutableUiState.asStateFlow()

    init {
        load()
    }

    fun refresh() = load()

    fun retry() = load()

    fun createList(
        title: String,
        description: String,
        visibility: String,
    ) {
        if (mutableUiState.value.isCreating) return
        mutableUiState.update { it.copy(isCreating = true, createError = null) }
        scope.launch {
            try {
                val created = repository.createList(title, description, visibility)
                mutableUiState.update { state ->
                    val readLater = state.lists.filter(ReadingList::isReadLater)
                    val others = state.lists.filterNot(ReadingList::isReadLater)
                    state.copy(lists = readLater + created + others, phase = ListsPhase.Content, isCreating = false)
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (exception: Throwable) {
                mutableUiState.update { it.copy(isCreating = false, createError = exception.toMobileFeatureError()) }
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
                val lists = repository.myLists()
                mutableUiState.update {
                    it.copy(
                        lists = lists,
                        phase = if (lists.isEmpty()) ListsPhase.Empty else ListsPhase.Content,
                        isLoading = false,
                    )
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (exception: Throwable) {
                mutableUiState.update { it.copy(phase = ListsPhase.Error, error = exception.toMobileFeatureError(), isLoading = false) }
            }
        }
    }
}

data class ListsUiState(
    val lists: List<ReadingList> = emptyList(),
    val phase: ListsPhase = ListsPhase.Loading,
    val error: MobileFeatureError? = null,
    val isLoading: Boolean = false,
    val isCreating: Boolean = false,
    val createError: MobileFeatureError? = null,
)

enum class ListsPhase {
    Loading,
    Content,
    Empty,
    Error,
}

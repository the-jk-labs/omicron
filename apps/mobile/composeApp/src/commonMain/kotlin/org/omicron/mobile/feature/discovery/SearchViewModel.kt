package org.omicron.mobile.feature.discovery

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
import org.omicron.mobile.data.repository.DiscoveryRepository
import org.omicron.mobile.data.repository.MissingInstanceException
import org.omicron.mobile.domain.model.SearchResults

class SearchViewModel(
    private val repository: DiscoveryRepository,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
) {
    private val mutableUiState = MutableStateFlow(SearchUiState())
    val uiState: StateFlow<SearchUiState> = mutableUiState.asStateFlow()

    fun updateQuery(value: String) {
        mutableUiState.update { it.copy(query = value) }
    }

    fun updateTagFilter(value: String) {
        mutableUiState.update { it.copy(tagFilter = value) }
    }

    fun updateAuthorFilter(value: String) {
        mutableUiState.update { it.copy(authorFilter = value) }
    }

    fun selectTab(tab: SearchTab) {
        mutableUiState.update { it.copy(selectedTab = tab) }
    }

    fun clearFilters() {
        mutableUiState.update { it.copy(tagFilter = "", authorFilter = "") }
    }

    fun search() {
        val query = mutableUiState.value.query.trim()
        if (query.isEmpty()) {
            mutableUiState.update { it.copy(phase = SearchPhase.Idle, results = SearchResults(emptyList(), emptyList(), emptyList())) }
            return
        }
        val tag = mutableUiState.value.tagFilter.trim().ifEmpty { null }
        val author = mutableUiState.value.authorFilter.trim().ifEmpty { null }
        scope.launch {
            mutableUiState.update { it.copy(phase = SearchPhase.Loading) }
            runCatching { repository.search(query, tag = tag, author = author) }
                .onSuccess { results ->
                    mutableUiState.update {
                        it.copy(
                            results = results,
                            selectedTab = it.selectedTab.takeIf { tab -> tab.hasResults(results) } ?: results.preferredTab(),
                            phase =
                                if (results.posts.isEmpty() && results.people.isEmpty() && results.tags.isEmpty()) {
                                    SearchPhase.Empty
                                } else {
                                    SearchPhase.Content
                                },
                        )
                    }
                }.onFailure { error ->
                    mutableUiState.update { it.copy(phase = SearchPhase.Error(error.toSearchError())) }
                }
        }
    }

    fun retry() {
        search()
    }

    fun close() {
        scope.cancel()
    }
}

data class SearchUiState(
    val query: String = "",
    val tagFilter: String = "",
    val authorFilter: String = "",
    val selectedTab: SearchTab = SearchTab.Articles,
    val results: SearchResults = SearchResults(emptyList(), emptyList(), emptyList()),
    val phase: SearchPhase = SearchPhase.Idle,
)

enum class SearchTab {
    Articles,
    Tags,
    People,
}

sealed interface SearchPhase {
    data object Idle : SearchPhase

    data object Loading : SearchPhase

    data object Content : SearchPhase

    data object Empty : SearchPhase

    data class Error(val error: SearchError) : SearchPhase
}

enum class SearchError {
    Offline,
    Server,
    MissingInstance,
}

private fun SearchTab.hasResults(results: SearchResults): Boolean =
    when (this) {
        SearchTab.Articles -> results.posts.isNotEmpty()
        SearchTab.Tags -> results.tags.isNotEmpty()
        SearchTab.People -> results.people.isNotEmpty()
    }

private fun SearchResults.preferredTab(): SearchTab =
    when {
        posts.isNotEmpty() -> SearchTab.Articles
        tags.isNotEmpty() -> SearchTab.Tags
        people.isNotEmpty() -> SearchTab.People
        else -> SearchTab.Articles
    }

private fun Throwable.toSearchError(): SearchError =
    when {
        this is MissingInstanceException -> SearchError.MissingInstance
        this is IOException -> SearchError.Offline
        else -> SearchError.Server
    }

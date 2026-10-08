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
import org.omicron.mobile.domain.model.DiscoverContent

class DiscoverViewModel(
    private val repository: DiscoveryRepository,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
) {
    private val mutableUiState = MutableStateFlow(DiscoverUiState())
    val uiState: StateFlow<DiscoverUiState> = mutableUiState.asStateFlow()

    init {
        load()
    }

    fun refresh() {
        load()
    }

    fun retry() {
        load()
    }

    fun close() {
        scope.cancel()
    }

    private fun load() {
        scope.launch {
            mutableUiState.update { it.copy(phase = DiscoverPhase.Loading) }
            runCatching { repository.discover() }
                .onSuccess { content ->
                    mutableUiState.update {
                        it.copy(
                            content = content,
                            phase =
                                if (content.trendingPosts.isEmpty() && content.topics.isEmpty() && content.suggestedPeople.isEmpty()) {
                                    DiscoverPhase.Empty
                                } else {
                                    DiscoverPhase.Content
                                },
                        )
                    }
                }.onFailure { error ->
                    mutableUiState.update { it.copy(phase = DiscoverPhase.Error(error.toDiscoverError())) }
                }
        }
    }
}

data class DiscoverUiState(
    val content: DiscoverContent = DiscoverContent(emptyList(), emptyList(), emptyList()),
    val phase: DiscoverPhase = DiscoverPhase.Loading,
)

sealed interface DiscoverPhase {
    data object Loading : DiscoverPhase

    data object Content : DiscoverPhase

    data object Empty : DiscoverPhase

    data class Error(val error: DiscoverError) : DiscoverPhase
}

enum class DiscoverError {
    Offline,
    Server,
    MissingInstance,
}

internal fun Throwable.toDiscoverError(): DiscoverError =
    when {
        this is MissingInstanceException -> DiscoverError.MissingInstance
        this is IOException -> DiscoverError.Offline
        else -> DiscoverError.Server
    }

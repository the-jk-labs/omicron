package org.omicron.mobile.feature.dashboard

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
import org.omicron.mobile.domain.model.WriterDashboard
import org.omicron.mobile.feature.common.MobileFeatureError
import org.omicron.mobile.feature.common.toMobileFeatureError

class DashboardViewModel(
    private val repository: MobileWebRepository,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
) {
    private val mutableUiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = mutableUiState.asStateFlow()

    init {
        load()
    }

    fun refresh() = load()

    fun retry() = load()

    fun close() {
        scope.cancel()
    }

    private fun load() {
        if (mutableUiState.value.isLoading) return
        mutableUiState.update { it.copy(isLoading = true, error = null) }
        scope.launch {
            try {
                val dashboard = repository.dashboard()
                mutableUiState.update {
                    it.copy(
                        summary = dashboard,
                        phase = if (dashboard.posts.isEmpty()) DashboardPhase.Empty else DashboardPhase.Content,
                        isLoading = false,
                    )
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (exception: Throwable) {
                mutableUiState.update { it.copy(phase = DashboardPhase.Error, error = exception.toMobileFeatureError(), isLoading = false) }
            }
        }
    }
}

data class DashboardUiState(
    val summary: WriterDashboard? = null,
    val phase: DashboardPhase = DashboardPhase.Loading,
    val error: MobileFeatureError? = null,
    val isLoading: Boolean = false,
)

enum class DashboardPhase {
    Loading,
    Content,
    Empty,
    Error,
}

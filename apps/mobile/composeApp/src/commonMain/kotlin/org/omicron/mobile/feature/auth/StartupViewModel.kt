package org.omicron.mobile.feature.auth

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.omicron.mobile.data.repository.AuthRepository
import org.omicron.mobile.domain.model.InstanceConfiguration
import org.omicron.mobile.domain.model.HomeSnapshot

class StartupViewModel(
    private val savedInstance: suspend () -> InstanceConfiguration?,
    private val repository: AuthRepository,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
) {
    private val mutableUiState = MutableStateFlow<StartupPhase>(StartupPhase.Restoring)
    val uiState: StateFlow<StartupPhase> = mutableUiState.asStateFlow()
    private var restoreJob: Job? = null
    private var openHomeAfterPreparation = false

    init {
        restore()
    }

    fun restore() {
        if (restoreJob?.isActive == true) return
        if (mutableUiState.value !is StartupPhase.Ready) mutableUiState.value = StartupPhase.Restoring
        restoreJob = scope.launch {
            var hasSavedInstance = false
            try {
                val instance = savedInstance()
                hasSavedInstance = instance != null
                val snapshot = if (instance != null && mutableUiState.value !is StartupPhase.Ready) repository.prepareStartup(instance.origin) else null
                if (mutableUiState.value !is StartupPhase.Ready) {
                    mutableUiState.value = StartupPhase.Ready(hasSavedInstance, snapshot, instance?.origin, openHomeAfterPreparation)
                    openHomeAfterPreparation = false
                }
                if (instance != null) repository.restoreSavedSession(instance.origin)
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Throwable) {
                if (mutableUiState.value !is StartupPhase.Ready) mutableUiState.value = StartupPhase.Error(hasSavedInstance)
            }
        }
    }

    fun continueAsGuest() {
        val error = mutableUiState.value as? StartupPhase.Error ?: return
        if (error.hasSavedInstance) mutableUiState.value = StartupPhase.Ready(hasSavedInstance = true)
    }

    fun chooseInstance() {
        if (mutableUiState.value is StartupPhase.Error) {
            mutableUiState.value = StartupPhase.Ready(hasSavedInstance = false)
        }
    }

    fun openSelectedInstance() {
        restoreJob?.cancel()
        openHomeAfterPreparation = true
        mutableUiState.value = StartupPhase.Restoring
        restore()
    }

    fun close() {
        scope.cancel()
    }
}

sealed interface StartupPhase {
    data object Restoring : StartupPhase

    data class Ready(
        val hasSavedInstance: Boolean,
        val snapshot: HomeSnapshot? = null,
        val origin: String? = null,
        val openHome: Boolean = false,
    ) : StartupPhase

    data class Error(
        val hasSavedInstance: Boolean,
    ) : StartupPhase
}

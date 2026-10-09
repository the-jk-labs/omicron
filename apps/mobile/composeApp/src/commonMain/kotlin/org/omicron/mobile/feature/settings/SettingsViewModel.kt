package org.omicron.mobile.feature.settings

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
import org.omicron.mobile.core.storage.AppearancePreferenceStore
import org.omicron.mobile.data.repository.AuthRepository
import org.omicron.mobile.domain.model.AppearancePreference
import org.omicron.mobile.domain.model.AuthenticatedUser
import org.omicron.mobile.domain.model.InstanceConfiguration

class SettingsViewModel(
    private val savedInstance: suspend () -> InstanceConfiguration?,
    private val authRepository: AuthRepository,
    private val appearanceStore: AppearancePreferenceStore,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
) {
    private val mutableUiState = MutableStateFlow(
        SettingsUiState(
            user = authRepository.session.value?.user,
            sessionExpired = authRepository.sessionExpired.value,
        ),
    )
    val uiState: StateFlow<SettingsUiState> = mutableUiState.asStateFlow()

    init {
        scope.launch {
            val instance = runCatching { savedInstance() }.getOrNull()
            val appearance = runCatching { appearanceStore.read() }.getOrDefault(AppearancePreference.System)
            mutableUiState.update {
                it.copy(instance = instance, appearance = appearance, isLoading = false)
            }
        }
        scope.launch {
            authRepository.session.collect { session ->
                mutableUiState.update {
                    it.copy(
                        user = session?.user,
                        signOutWarning = if (session != null) false else it.signOutWarning,
                    )
                }
            }
        }
        scope.launch {
            authRepository.sessionExpired.collect { expired ->
                mutableUiState.update { it.copy(sessionExpired = expired) }
            }
        }
    }

    fun setAppearance(preference: AppearancePreference) {
        val state = mutableUiState.value
        if (state.isSavingAppearance || state.appearance == preference) return
        mutableUiState.update {
            it.copy(
                appearance = preference,
                pendingAppearance = preference,
                isSavingAppearance = true,
                appearanceSaveFailed = false,
            )
        }
        scope.launch {
            try {
                appearanceStore.write(preference)
                mutableUiState.update { it.copy(isSavingAppearance = false, pendingAppearance = null) }
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Throwable) {
                mutableUiState.update {
                    it.copy(
                        appearance = state.appearance,
                        isSavingAppearance = false,
                        appearanceSaveFailed = true,
                    )
                }
            }
        }
    }

    fun retryAppearanceSave() {
        val preference = mutableUiState.value.pendingAppearance ?: return
        setAppearance(preference)
    }

    fun signOut() {
        val state = mutableUiState.value
        val origin = state.instance?.origin ?: return
        if (state.user == null || state.isSigningOut) return
        mutableUiState.update { it.copy(isSigningOut = true, signOutWarning = false) }
        scope.launch {
            try {
                authRepository.signOut(origin)
                mutableUiState.update { it.copy(isSigningOut = false, user = null, sessionExpired = false) }
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Throwable) {
                mutableUiState.update {
                    it.copy(isSigningOut = false, user = null, sessionExpired = false, signOutWarning = true)
                }
            }
        }
    }

    fun close() {
        scope.cancel()
    }
}

data class SettingsUiState(
    val isLoading: Boolean = true,
    val instance: InstanceConfiguration? = null,
    val appearance: AppearancePreference = AppearancePreference.System,
    val isSavingAppearance: Boolean = false,
    val pendingAppearance: AppearancePreference? = null,
    val appearanceSaveFailed: Boolean = false,
    val user: AuthenticatedUser? = null,
    val sessionExpired: Boolean = false,
    val isSigningOut: Boolean = false,
    val signOutWarning: Boolean = false,
)

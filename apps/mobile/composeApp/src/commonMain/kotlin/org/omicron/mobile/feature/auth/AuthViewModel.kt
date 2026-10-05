package org.omicron.mobile.feature.auth

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.omicron.mobile.data.repository.AuthRepository
import org.omicron.mobile.domain.model.AuthenticatedUser
import org.omicron.mobile.domain.model.InstanceConfiguration

class AuthViewModel(
    private val savedInstance: suspend () -> InstanceConfiguration?,
    private val repository: AuthRepository,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
) {
    private val mutableUiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = mutableUiState.asStateFlow()

    init {
        restore()
    }

    fun restore() {
        scope.launch {
            mutableUiState.update { AuthUiState(phase = AuthPhase.Restoring) }
            val instance = runCatching { savedInstance() }.getOrNull()
            if (instance == null) {
                mutableUiState.update { AuthUiState(phase = AuthPhase.Error(AuthError.MissingInstance)) }
                return@launch
            }
            runCatching { repository.restore(instance.origin) }
                .onSuccess { session ->
                    mutableUiState.update {
                        AuthUiState(
                            phase =
                                session?.let { AuthPhase.SignedIn(instance, it.user) }
                                    ?: AuthPhase.SignedOut(instance),
                        )
                    }
                }.onFailure {
                    mutableUiState.update { AuthUiState(phase = AuthPhase.Error(AuthError.Unavailable)) }
                }
        }
    }

    fun close() {
        scope.cancel()
    }
}

data class AuthUiState(
    val phase: AuthPhase = AuthPhase.Restoring,
)

sealed interface AuthPhase {
    data object Restoring : AuthPhase

    data class SignedOut(
        val instance: InstanceConfiguration,
    ) : AuthPhase

    data class SignedIn(
        val instance: InstanceConfiguration,
        val user: AuthenticatedUser,
    ) : AuthPhase

    data class Error(
        val error: AuthError,
    ) : AuthPhase
}

enum class AuthError {
    MissingInstance,
    Unavailable,
}

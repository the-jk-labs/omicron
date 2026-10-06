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
import org.omicron.mobile.data.repository.AuthenticationResult
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
                                    ?: AuthPhase.Credentials(instance),
                        )
                    }
                }.onFailure {
                    mutableUiState.update { AuthUiState(phase = AuthPhase.Error(AuthError.Unavailable)) }
                }
        }
    }

    fun updateIdentifier(identifier: String) = updateCredentials { it.copy(form = it.form.copy(identifier = identifier), error = null) }

    fun updateUsername(username: String) = updateCredentials { it.copy(form = it.form.copy(username = username), error = null) }

    fun updateEmail(email: String) = updateCredentials { it.copy(form = it.form.copy(email = email), error = null) }

    fun updateDisplayName(displayName: String) = updateCredentials { it.copy(form = it.form.copy(displayName = displayName), error = null) }

    fun updatePassword(password: String) = updateCredentials { it.copy(form = it.form.copy(password = password), error = null) }

    fun updateConfirmation(password: String) = updateCredentials { it.copy(form = it.form.copy(confirmation = password), error = null) }

    fun showSignIn() {
        mutableUiState.update { state ->
            when (val phase = state.phase) {
                is AuthPhase.Credentials -> state.copy(phase = phase.copy(mode = AuthMode.SignIn, error = null))
                is AuthPhase.VerificationRequired ->
                    AuthUiState(
                        phase =
                            AuthPhase.Credentials(
                                instance = phase.instance,
                                form = AuthForm(identifier = phase.email.orEmpty()),
                            ),
                    )

                else -> state
            }
        }
    }

    fun showRegistration() = updateCredentials { it.copy(mode = AuthMode.Register, error = null) }

    fun signIn() {
        val credentials = mutableUiState.value.phase as? AuthPhase.Credentials ?: return
        val identifier = credentials.form.identifier.trim().removePrefix("@")
        val password = credentials.form.password
        val error = validateSignIn(identifier, password)
        if (error != null) {
            updateCredentials { it.copy(error = error) }
            return
        }
        mutableUiState.update { it.copy(phase = credentials.copy(isSubmitting = true, error = null)) }
        scope.launch {
            val result =
                if ('@' in identifier) {
                    repository.signInEmail(credentials.instance.origin, identifier.lowercase(), password)
                } else {
                    repository.signInUsername(credentials.instance.origin, identifier.lowercase(), password)
                }
            applyAuthenticationResult(credentials, result, identifier.takeIf { '@' in identifier })
        }
    }

    fun register() {
        val credentials = mutableUiState.value.phase as? AuthPhase.Credentials ?: return
        val form = credentials.form
        val username = form.username.trim().lowercase()
        val email = form.email.trim().lowercase()
        val error = validateRegistration(username, email, form.password, form.confirmation, form.displayName)
        if (error != null) {
            updateCredentials { it.copy(error = error) }
            return
        }
        mutableUiState.update { it.copy(phase = credentials.copy(isSubmitting = true, error = null)) }
        scope.launch {
            val result =
                repository.signUpEmail(
                    origin = credentials.instance.origin,
                    email = email,
                    password = form.password,
                    username = username,
                    displayName = form.displayName.trim().ifEmpty { username },
                )
            applyAuthenticationResult(credentials, result, email)
        }
    }

    fun signOut() {
        val signedIn = mutableUiState.value.phase as? AuthPhase.SignedIn ?: return
        mutableUiState.update { it.copy(phase = signedIn.copy(isSigningOut = true, error = null)) }
        scope.launch {
            runCatching { repository.signOut(signedIn.instance.origin) }
                .onSuccess {
                    mutableUiState.update { AuthUiState(phase = AuthPhase.Credentials(signedIn.instance)) }
                }.onFailure {
                    mutableUiState.update {
                        AuthUiState(phase = signedIn.copy(isSigningOut = false, error = AuthError.Unavailable))
                    }
                }
        }
    }

    private fun applyAuthenticationResult(
        credentials: AuthPhase.Credentials,
        result: AuthenticationResult,
        email: String?,
    ) {
        mutableUiState.update {
            AuthUiState(
                phase =
                    when (result) {
                        is AuthenticationResult.Authenticated -> AuthPhase.SignedIn(credentials.instance, result.session.user)
                        AuthenticationResult.VerificationRequired -> AuthPhase.VerificationRequired(credentials.instance, email)
                        AuthenticationResult.EmailAlreadyRegistered ->
                            credentials.copy(mode = AuthMode.Register, isSubmitting = false, error = AuthFormError.EmailAlreadyRegistered)

                        AuthenticationResult.InvalidCredentials ->
                            credentials.copy(isSubmitting = false, error = AuthFormError.InvalidCredentials)

                        AuthenticationResult.Unavailable ->
                            credentials.copy(isSubmitting = false, error = AuthFormError.Unavailable)
                    },
            )
        }
    }

    private fun updateCredentials(update: (AuthPhase.Credentials) -> AuthPhase.Credentials) {
        mutableUiState.update { state ->
            val phase = state.phase as? AuthPhase.Credentials ?: return@update state
            state.copy(phase = update(phase))
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

    data class Credentials(
        val instance: InstanceConfiguration,
        val mode: AuthMode = AuthMode.SignIn,
        val form: AuthForm = AuthForm(),
        val isSubmitting: Boolean = false,
        val error: AuthFormError? = null,
    ) : AuthPhase

    data class SignedIn(
        val instance: InstanceConfiguration,
        val user: AuthenticatedUser,
        val isSigningOut: Boolean = false,
        val error: AuthError? = null,
    ) : AuthPhase

    data class VerificationRequired(
        val instance: InstanceConfiguration,
        val email: String?,
    ) : AuthPhase

    data class Error(
        val error: AuthError,
    ) : AuthPhase
}

enum class AuthError {
    MissingInstance,
    Unavailable,
}

enum class AuthMode {
    SignIn,
    Register,
}

data class AuthForm(
    val identifier: String = "",
    val username: String = "",
    val email: String = "",
    val displayName: String = "",
    val password: String = "",
    val confirmation: String = "",
)

enum class AuthFormError {
    IdentifierRequired,
    InvalidCredentials,
    InvalidUsername,
    InvalidEmail,
    PasswordTooShort,
    PasswordTooLong,
    PasswordsDoNotMatch,
    DisplayNameTooLong,
    EmailAlreadyRegistered,
    Unavailable,
}

private fun validateSignIn(identifier: String, password: String): AuthFormError? =
    when {
        identifier.isBlank() -> AuthFormError.IdentifierRequired
        '@' in identifier && !EMAIL_REGEX.matches(identifier) -> AuthFormError.InvalidEmail
        '@' !in identifier && !USERNAME_REGEX.matches(identifier.lowercase()) -> AuthFormError.InvalidUsername
        password.length < MIN_PASSWORD_LENGTH -> AuthFormError.PasswordTooShort
        password.length > MAX_PASSWORD_LENGTH -> AuthFormError.PasswordTooLong
        else -> null
    }

private fun validateRegistration(
    username: String,
    email: String,
    password: String,
    confirmation: String,
    displayName: String,
): AuthFormError? =
    when {
        !USERNAME_REGEX.matches(username) -> AuthFormError.InvalidUsername
        !EMAIL_REGEX.matches(email) -> AuthFormError.InvalidEmail
        password.length < MIN_PASSWORD_LENGTH -> AuthFormError.PasswordTooShort
        password.length > MAX_PASSWORD_LENGTH -> AuthFormError.PasswordTooLong
        password != confirmation -> AuthFormError.PasswordsDoNotMatch
        displayName.trim().length > MAX_DISPLAY_NAME_LENGTH -> AuthFormError.DisplayNameTooLong
        else -> null
    }

private const val MIN_PASSWORD_LENGTH = 12
private const val MAX_PASSWORD_LENGTH = 128
private const val MAX_DISPLAY_NAME_LENGTH = 60
private val USERNAME_REGEX = Regex("^[a-z0-9_]{3,30}$")
private val EMAIL_REGEX = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

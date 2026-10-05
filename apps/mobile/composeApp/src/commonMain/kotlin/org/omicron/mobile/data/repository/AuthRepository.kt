package org.omicron.mobile.data.repository

import io.ktor.util.date.getTimeMillis
import kotlinx.coroutines.CancellationException
import org.omicron.mobile.data.api.AuthApi
import org.omicron.mobile.data.api.AuthApiException
import org.omicron.mobile.domain.model.AuthenticatedSession
import org.omicron.mobile.domain.model.AuthenticatedUser

class AuthRepository(
    private val api: AuthApi,
    private val now: () -> Long = ::getTimeMillis,
) {
    private var activeSession: AuthenticatedSession? = null
    private var activeOrigin: String? = null
    private var tokenMintedAt: Long? = null

    suspend fun restore(origin: String): AuthenticatedSession? {
        val session =
            api.getSession(origin) ?: run {
                clearSession()
                return null
            }
        val token = api.getToken(origin)
        return rememberSession(
            origin = origin,
            user =
                AuthenticatedUser(
                    id = session.user.id,
                    email = session.user.email,
                    username = session.user.username,
                    displayName = session.user.displayName,
            ),
            accessToken = token.token,
        )
    }

    suspend fun signOut(origin: String) {
        api.signOut(origin)
        clearSession()
    }

    suspend fun signInEmail(origin: String, email: String, password: String): AuthenticationResult =
        authenticate(origin) { api.signInEmail(origin, email, password) }

    suspend fun signInUsername(origin: String, username: String, password: String): AuthenticationResult =
        authenticate(origin) { api.signInUsername(origin, username, password) }

    suspend fun signUpEmail(
        origin: String,
        email: String,
        password: String,
        username: String,
        displayName: String,
    ): AuthenticationResult =
        try {
            val result = api.signUpEmail(origin, email, password, username, displayName)
            if (result.token == null) {
                AuthenticationResult.VerificationRequired
            } else {
                restoredResult(origin)
            }
        } catch (exception: Throwable) {
            exception.toAuthenticationResult()
        }

    fun currentSession(): AuthenticatedSession? = activeSession

    suspend fun accessToken(origin: String): String? {
        val session = activeSession ?: return null
        val mintedAt = tokenMintedAt ?: return null
        if (activeOrigin != origin) return null
        val age = now() - mintedAt
        if (age < TOKEN_REFRESH_AFTER_MILLIS) return session.accessToken
        return try {
            rememberSession(origin, session.user, api.getToken(origin).token).accessToken
        } catch (exception: Throwable) {
            if (exception is CancellationException) throw exception
            if (age < TOKEN_EXPIRES_AFTER_MILLIS) {
                session.accessToken
            } else {
                clearSession()
                null
            }
        }
    }

    private suspend fun authenticate(
        origin: String,
        request: suspend () -> Unit,
    ): AuthenticationResult =
        try {
            request()
            restoredResult(origin)
        } catch (exception: Throwable) {
            exception.toAuthenticationResult()
        }

    private suspend fun restoredResult(origin: String): AuthenticationResult =
        restore(origin)?.let(AuthenticationResult::Authenticated) ?: AuthenticationResult.Unavailable

    private fun Throwable.toAuthenticationResult(): AuthenticationResult {
        if (this is CancellationException) throw this
        return when ((this as? AuthApiException)?.code) {
            "EMAIL_NOT_VERIFIED" -> AuthenticationResult.VerificationRequired
            "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" -> AuthenticationResult.EmailAlreadyRegistered
            "INVALID_EMAIL_OR_PASSWORD", "INVALID_USERNAME_OR_PASSWORD" -> AuthenticationResult.InvalidCredentials
            else -> AuthenticationResult.Unavailable
        }
    }

    private fun rememberSession(
        origin: String,
        user: AuthenticatedUser,
        accessToken: String,
    ): AuthenticatedSession =
        AuthenticatedSession(user, accessToken).also {
            activeSession = it
            activeOrigin = origin
            tokenMintedAt = now()
        }

    private fun clearSession() {
        activeSession = null
        activeOrigin = null
        tokenMintedAt = null
    }

    private companion object {
        const val TOKEN_REFRESH_AFTER_MILLIS = 14 * 60 * 1_000L
        const val TOKEN_EXPIRES_AFTER_MILLIS = 15 * 60 * 1_000L
    }
}

sealed interface AuthenticationResult {
    data class Authenticated(
        val session: AuthenticatedSession,
    ) : AuthenticationResult

    data object VerificationRequired : AuthenticationResult

    data object EmailAlreadyRegistered : AuthenticationResult

    data object InvalidCredentials : AuthenticationResult

    data object Unavailable : AuthenticationResult
}

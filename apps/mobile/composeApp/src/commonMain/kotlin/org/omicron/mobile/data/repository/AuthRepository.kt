package org.omicron.mobile.data.repository

import io.ktor.util.date.getTimeMillis
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.flow.updateAndGet
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.omicron.mobile.core.storage.SessionCookieStore
import org.omicron.mobile.data.api.AuthApi
import org.omicron.mobile.data.api.AuthApiException
import org.omicron.mobile.data.api.AuthUserDto
import org.omicron.mobile.domain.model.AuthenticatedSession
import org.omicron.mobile.domain.model.AuthenticatedUser
import org.omicron.mobile.domain.model.HomeSnapshot

class AuthRepository(
    private val api: AuthApi,
    private val sessionCookieStore: SessionCookieStore,
    private val now: () -> Long = ::getTimeMillis,
    private val homeSnapshots: HomeSnapshotRepository? = null,
) {
    private var activeSession: AuthenticatedSession? = null
    private var activeOrigin: String? = null
    private var tokenMintedAt: Long? = null
    private val mutableSession = MutableStateFlow<AuthenticatedSession?>(null)
    val session: StateFlow<AuthenticatedSession?> = mutableSession.asStateFlow()
    private val mutableSessionExpired = MutableStateFlow(false)
    val sessionExpired: StateFlow<Boolean> = mutableSessionExpired.asStateFlow()
    private val mutableDisplayUser = MutableStateFlow<AuthenticatedUser?>(null)
    val displayUser: StateFlow<AuthenticatedUser?> = mutableDisplayUser.asStateFlow()
    private val mutableRefreshState = MutableStateFlow(SessionRefreshState.Ready)
    val refreshState: StateFlow<SessionRefreshState> = mutableRefreshState.asStateFlow()
    val homeSnapshot: StateFlow<HomeSnapshot?> = homeSnapshots?.snapshot ?: MutableStateFlow(null)
    private val revision = MutableStateFlow(0L)
    private val restoreMutex = Mutex()
    private var restorationOrigin: String? = null

    suspend fun prepareStartup(origin: String): HomeSnapshot? {
        revision.update { it + 1 }
        val hasCookie = hasSavedCookie(origin)
        clearSession()
        val snapshot = homeSnapshots?.preload(origin, hasCookie)
        mutableDisplayUser.value = snapshot?.user
        restorationOrigin = origin.takeIf { hasCookie }
        mutableRefreshState.value = if (hasCookie) SessionRefreshState.Restoring else SessionRefreshState.Ready
        return snapshot
    }

    suspend fun restoreSavedSession(origin: String): AuthenticatedSession? {
        if (activeOrigin == origin && activeSession != null) return activeSession
        if (!hasSavedCookie(origin)) {
            clearSession()
            return null
        }
        return restore(origin)
    }

    suspend fun restore(origin: String): AuthenticatedSession? = restoreMutex.withLock {
        val expectedRevision = revision.value
        restorationOrigin = origin
        mutableRefreshState.value = SessionRefreshState.Restoring
        try {
            val session = api.getSession(origin)
            ensureRevision(expectedRevision)
            if (session == null) {
                clearSession()
                sessionCookieStore.clear(origin)
                homeSnapshots?.clear(origin)
                return@withLock null
            }
            val token = api.getToken(origin)
            ensureRevision(expectedRevision)
            rememberSession(
                origin = origin,
                user = AuthenticatedUser(
                    id = session.user.id,
                    email = session.user.email,
                    username = session.user.username,
                    displayName = session.user.displayName,
                    avatarUrl = session.user.avatarUrl?.let { resolveMediaUrl(origin, it) },
                ),
                accessToken = token.token,
                expectedRevision = expectedRevision,
            )
        } catch (exception: CancellationException) {
            throw exception
        } catch (exception: Throwable) {
            ensureRevision(expectedRevision)
            if ((exception as? AuthApiException)?.code == UNAUTHORIZED_CODE) {
                expireSession()
                sessionCookieStore.clear(origin)
                homeSnapshots?.clear(origin)
                null
            } else {
                mutableRefreshState.value = SessionRefreshState.Unavailable
                throw exception
            }
        }
    }

    suspend fun signOut(origin: String) {
        revision.update { it + 1 }
        clearSession()
        homeSnapshots?.clear(origin)
        restoreMutex.withLock {
            try {
                api.signOut(origin)
            } finally {
                clearSession()
                sessionCookieStore.clear(origin)
                mutableSessionExpired.value = false
            }
        }
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
        restoreMutex.withLock {
            val expectedRevision = revision.updateAndGet { it + 1 }
            clearSession()
            homeSnapshots?.clear()
            try {
                val result = api.signUpEmail(origin, email, password, username, displayName)
                ensureRevision(expectedRevision)
                if (result.token == null) {
                    AuthenticationResult.VerificationRequired
                } else {
                    authenticatedResult(origin, result.user, expectedRevision)
                }
            } catch (exception: Throwable) {
                exception.toAuthenticationResult()
            }
        }

    fun currentSession(): AuthenticatedSession? = activeSession

    suspend fun invalidateSession() {
        val origin = activeOrigin ?: restorationOrigin
        revision.update { it + 1 }
        if (activeSession != null) mutableSessionExpired.value = true
        clearSession()
        homeSnapshots?.clear(origin)
    }

    suspend fun accessToken(origin: String): String? {
        if (restorationOrigin == origin) {
            mutableRefreshState.first { it != SessionRefreshState.Restoring }
            if (mutableRefreshState.value == SessionRefreshState.Unavailable) throw SessionRefreshUnavailableException()
        }
        val session = activeSession ?: return null
        val mintedAt = tokenMintedAt ?: return null
        if (activeOrigin != origin) return null
        val age = now() - mintedAt
        if (age < TOKEN_REFRESH_AFTER_MILLIS) return session.accessToken
        val expectedRevision = revision.value
        return try {
            rememberSession(origin, session.user, api.getToken(origin).token, expectedRevision).accessToken
        } catch (exception: Throwable) {
            if (exception is CancellationException) throw exception
            if ((exception as? AuthApiException)?.code == UNAUTHORIZED_CODE) {
                expireSession()
                sessionCookieStore.clear(origin)
                homeSnapshots?.clear(origin)
                null
            } else if (age < TOKEN_EXPIRES_AFTER_MILLIS) {
                session.accessToken
            } else {
                activeSession = null
                tokenMintedAt = null
                mutableSession.value = null
                mutableRefreshState.value = SessionRefreshState.Unavailable
                throw SessionRefreshUnavailableException()
            }
        }
    }

    private suspend fun authenticate(
        origin: String,
        request: suspend () -> org.omicron.mobile.data.api.AuthSessionCreationDto,
    ): AuthenticationResult =
        restoreMutex.withLock {
            val expectedRevision = revision.updateAndGet { it + 1 }
            try {
                clearSession()
                homeSnapshots?.clear()
                authenticatedResult(origin, request().user, expectedRevision)
            } catch (exception: Throwable) {
                exception.toAuthenticationResult()
            }
        }

    private suspend fun restoredResult(origin: String): AuthenticationResult =
        restore(origin)?.let(AuthenticationResult::Authenticated) ?: AuthenticationResult.Unavailable

    private suspend fun authenticatedResult(
        origin: String,
        user: AuthUserDto,
        expectedRevision: Long,
    ): AuthenticationResult =
        AuthenticationResult.Authenticated(
            rememberSession(
                origin = origin,
                user = AuthenticatedUser(
                    user.id,
                    user.email,
                    user.username,
                    user.displayName,
                    user.avatarUrl?.let { resolveMediaUrl(origin, it) },
                ),
                accessToken = api.getToken(origin).token,
                expectedRevision = expectedRevision,
            ),
        )

    private fun Throwable.toAuthenticationResult(): AuthenticationResult {
        if (this is CancellationException) throw this
        return when ((this as? AuthApiException)?.code) {
            "EMAIL_NOT_VERIFIED" -> AuthenticationResult.VerificationRequired
            "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" -> AuthenticationResult.EmailAlreadyRegistered
            "INVALID_EMAIL_OR_PASSWORD", "INVALID_USERNAME_OR_PASSWORD" -> AuthenticationResult.InvalidCredentials
            else -> AuthenticationResult.Unavailable
        }
    }

    private suspend fun rememberSession(
        origin: String,
        user: AuthenticatedUser,
        accessToken: String,
        expectedRevision: Long = revision.value,
    ): AuthenticatedSession {
        ensureRevision(expectedRevision)
        homeSnapshots?.rememberAccount(origin, user)
        ensureRevision(expectedRevision)
        return AuthenticatedSession(user, accessToken).also {
            mutableSessionExpired.value = false
            activeSession = it
            activeOrigin = origin
            tokenMintedAt = now()
            mutableSession.value = it
            mutableDisplayUser.value = user
            mutableRefreshState.value = SessionRefreshState.Ready
        }
    }

    private fun clearSession() {
        activeSession = null
        activeOrigin = null
        tokenMintedAt = null
        mutableSession.value = null
        mutableDisplayUser.value = null
        mutableRefreshState.value = SessionRefreshState.Ready
    }

    private fun expireSession() {
        mutableSessionExpired.value = true
        clearSession()
    }

    private suspend fun hasSavedCookie(origin: String) = sessionCookieStore.read(origin).any { it.expiresAt == null || it.expiresAt > now() }

    private fun ensureRevision(expected: Long) {
        if (revision.value != expected) throw CancellationException("Authentication identity changed")
    }

    private companion object {
        const val TOKEN_REFRESH_AFTER_MILLIS = 14 * 60 * 1_000L
        const val TOKEN_EXPIRES_AFTER_MILLIS = 15 * 60 * 1_000L
        const val UNAUTHORIZED_CODE = "UNAUTHORIZED"
    }
}

enum class SessionRefreshState {
    Restoring,
    Ready,
    Unavailable,
}

class SessionRefreshUnavailableException : IllegalStateException("Session refresh is unavailable")

sealed interface AuthenticationResult {
    data class Authenticated(
        val session: AuthenticatedSession,
    ) : AuthenticationResult

    data object VerificationRequired : AuthenticationResult

    data object EmailAlreadyRegistered : AuthenticationResult

    data object InvalidCredentials : AuthenticationResult

    data object Unavailable : AuthenticationResult
}

package org.omicron.mobile.data.repository

import org.omicron.mobile.data.api.AuthApi
import org.omicron.mobile.domain.model.AuthenticatedSession
import org.omicron.mobile.domain.model.AuthenticatedUser

class AuthRepository(
    private val api: AuthApi,
) {
    private var activeSession: AuthenticatedSession? = null

    suspend fun restore(origin: String): AuthenticatedSession? {
        val session = api.getSession(origin) ?: return null.also { activeSession = null }
        val token = api.getToken(origin)
        return AuthenticatedSession(
            user =
                AuthenticatedUser(
                    id = session.user.id,
                    email = session.user.email,
                    username = session.user.username,
                    displayName = session.user.displayName,
                ),
            accessToken = token.token,
        ).also { activeSession = it }
    }

    suspend fun signOut(origin: String) {
        api.signOut(origin)
        activeSession = null
    }

    fun currentSession(): AuthenticatedSession? = activeSession
}

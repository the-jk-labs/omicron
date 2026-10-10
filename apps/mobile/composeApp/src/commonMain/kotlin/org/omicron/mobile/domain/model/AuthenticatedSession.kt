package org.omicron.mobile.domain.model

data class AuthenticatedSession(
    val user: AuthenticatedUser,
    val accessToken: String,
)

data class AuthenticatedUser(
    val id: String,
    val email: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String? = null,
)

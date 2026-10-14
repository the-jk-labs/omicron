package org.omicron.mobile.domain.model

import kotlinx.serialization.Serializable

data class AuthenticatedSession(
    val user: AuthenticatedUser,
    val accessToken: String,
)

@Serializable
data class AuthenticatedUser(
    val id: String,
    val email: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String? = null,
)

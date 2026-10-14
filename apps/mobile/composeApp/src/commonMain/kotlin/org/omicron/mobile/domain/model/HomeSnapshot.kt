package org.omicron.mobile.domain.model

import kotlinx.serialization.Serializable

@Serializable
data class HomeSnapshot(
    val origin: String,
    val user: AuthenticatedUser?,
    val accountUpdatedAtMillis: Long,
    val scope: String = "Global",
    val posts: List<Post> = emptyList(),
    val postsUpdatedAtMillis: Long? = null,
    val version: Int = 1,
)

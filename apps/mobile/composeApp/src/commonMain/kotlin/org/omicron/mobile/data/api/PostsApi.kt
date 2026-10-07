package org.omicron.mobile.data.api

import kotlinx.serialization.Serializable

enum class TimelineScope {
    Global,
    Local,
}

interface PostsApi {
    suspend fun timeline(
        origin: String,
        scope: TimelineScope,
        cursor: String?,
    ): TimelinePageDto
}

@Serializable
data class TimelinePageDto(
    val items: List<PostDto> = emptyList(),
    val nextCursor: String? = null,
)

@Serializable
data class PostDto(
    val id: String,
    val title: String? = null,
    val slug: String? = null,
    val contentHtml: String = "",
    val remote: Boolean = false,
    val language: String? = null,
    val summary: String? = null,
    val bannerUrl: String? = null,
    val createdAt: String,
    val updatedAt: String? = null,
    val author: PostAuthorDto,
    val tags: List<TagDto> = emptyList(),
    val likeCount: Int = 0,
    val liked: Boolean = false,
    val commentCount: Int = 0,
    val recommendCount: Int = 0,
    val recommended: Boolean = false,
)

@Serializable
data class PostAuthorDto(
    val id: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String? = null,
    val remote: Boolean = false,
)

@Serializable
data class TagDto(
    val slug: String,
    val name: String,
)

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
        accessToken: String? = null,
    ): TimelinePageDto

    suspend fun post(
        origin: String,
        id: String,
        accessToken: String? = null,
    ): PostDto

    suspend fun relatedPosts(
        origin: String,
        id: String,
        accessToken: String? = null,
    ): List<PostDto>
}

@Serializable
data class TimelinePageDto(
    val items: List<PostDto> = emptyList(),
    val nextCursor: String? = null,
)

@Serializable
data class SinglePostDto(
    val post: PostDto,
)

@Serializable
data class RelatedPostsDto(
    val items: List<PostDto> = emptyList(),
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
    val coverUrl: String? = null,
    val coverCredit: CoverCreditDto? = null,
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
data class CoverCreditDto(
    val name: String,
    val nameUrl: String,
    val source: String,
    val sourceUrl: String,
    val license: String? = null,
    val licenseUrl: String? = null,
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

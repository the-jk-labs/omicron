package org.omicron.mobile.data.api

import kotlinx.serialization.Serializable

enum class SearchScope {
    Articles,
    People,
    Tags,
}

interface DiscoveryApi {
    suspend fun search(
        origin: String,
        query: String,
        scope: SearchScope?,
        tag: String?,
        author: String?,
        accessToken: String? = null,
    ): SearchResultsDto

    suspend fun trendingPosts(
        origin: String,
        accessToken: String? = null,
    ): List<PostDto>

    suspend fun trendingTags(
        origin: String,
        accessToken: String? = null,
    ): List<DiscoveryTagDto>

    suspend fun suggestedUsers(
        origin: String,
        accessToken: String? = null,
    ): List<SuggestedUserDto>

    suspend fun tagDetail(
        origin: String,
        slug: String,
        accessToken: String? = null,
    ): TagDetailDto

    suspend fun tagPosts(
        origin: String,
        slug: String,
        cursor: String?,
        accessToken: String? = null,
    ): TimelinePageDto

    suspend fun setTagFollow(
        origin: String,
        slug: String,
        following: Boolean,
        accessToken: String,
    )
}

@Serializable
data class SearchResultsDto(
    val posts: List<PostDto> = emptyList(),
    val people: List<DiscoveryPersonDto> = emptyList(),
    val tags: List<DiscoveryTagDto> = emptyList(),
)

@Serializable
data class DiscoveryTagDto(
    val slug: String,
    val name: String,
    val postCount: Int = 0,
)

@Serializable
data class DiscoveryPersonDto(
    val id: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String? = null,
    val remote: Boolean = false,
)

@Serializable
data class SuggestedUserDto(
    val id: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String? = null,
    val remote: Boolean = false,
    val followerCount: Int = 0,
)

@Serializable
data class TagDetailDto(
    val tag: TagDto,
    val postCount: Int = 0,
    val followerCount: Int = 0,
    val isFollowing: Boolean = false,
)

@Serializable
data class TrendingPostsDto(
    val items: List<PostDto> = emptyList(),
)

@Serializable
data class TrendingTagsDto(
    val tags: List<DiscoveryTagDto> = emptyList(),
)

@Serializable
data class SuggestedUsersDto(
    val items: List<SuggestedUserDto> = emptyList(),
)

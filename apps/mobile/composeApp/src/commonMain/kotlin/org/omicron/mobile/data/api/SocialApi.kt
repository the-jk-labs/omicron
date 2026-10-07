package org.omicron.mobile.data.api

import kotlinx.serialization.Serializable

interface SocialApi {
    suspend fun postLike(
        origin: String,
        postId: String,
        liked: Boolean,
        accessToken: String,
    ): LikeStateDto

    suspend fun postRecommendation(
        origin: String,
        postId: String,
        recommended: Boolean,
        accessToken: String,
    ): RecommendationStateDto

    suspend fun comments(
        origin: String,
        postId: String,
        cursor: String?,
        accessToken: String?,
    ): CommentPageDto

    suspend fun createComment(
        origin: String,
        postId: String,
        content: String,
        parentId: String?,
        accessToken: String,
    ): SingleCommentDto

    suspend fun commentLike(
        origin: String,
        postId: String,
        commentId: String,
        liked: Boolean,
        accessToken: String,
    ): LikeStateDto

    suspend fun editComment(
        origin: String,
        postId: String,
        commentId: String,
        content: String,
        accessToken: String,
    ): EditedCommentDto

    suspend fun deleteComment(
        origin: String,
        postId: String,
        commentId: String,
        accessToken: String,
    )

    suspend fun listsForPost(
        origin: String,
        postId: String,
        accessToken: String,
    ): ReadingListsDto

    suspend fun readLater(
        origin: String,
        accessToken: String,
    ): ReadingListEnvelopeDto

    suspend fun addToList(
        origin: String,
        listId: String,
        postId: String,
        accessToken: String,
    )

    suspend fun removeFromList(
        origin: String,
        listId: String,
        postId: String,
        accessToken: String,
    )

    suspend fun localProfile(
        origin: String,
        username: String,
        accessToken: String?,
    ): LocalProfileDto

    suspend fun remoteProfile(
        origin: String,
        handle: String,
        accessToken: String?,
    ): RemoteProfileDto

    suspend fun localProfilePosts(
        origin: String,
        username: String,
        recommendations: Boolean,
        cursor: String?,
        accessToken: String?,
    ): TimelinePageDto

    suspend fun remoteProfilePosts(
        origin: String,
        handle: String,
        recommendations: Boolean,
        cursor: String?,
        accessToken: String?,
    ): TimelinePageDto

    suspend fun profileRelations(
        origin: String,
        username: String,
        following: Boolean,
        accessToken: String?,
    ): RelationActorsDto

    suspend fun setFollow(
        origin: String,
        handle: String,
        remote: Boolean,
        following: Boolean,
        accessToken: String,
    ): FollowStateDto

    suspend fun setMute(
        origin: String,
        handle: String,
        remote: Boolean,
        muted: Boolean,
        accessToken: String,
    )

    suspend fun setBlock(
        origin: String,
        handle: String,
        remote: Boolean,
        blocked: Boolean,
        accessToken: String,
    )
}

@Serializable
data class LikeStateDto(
    val likeCount: Int,
    val liked: Boolean,
)

@Serializable
data class RecommendationStateDto(
    val recommendCount: Int,
    val recommended: Boolean,
)

@Serializable
data class CommentPageDto(
    val items: List<CommentDto> = emptyList(),
    val nextCursor: String? = null,
)

@Serializable
data class SingleCommentDto(
    val comment: CommentDto,
)

@Serializable
data class EditedCommentDto(
    val comment: EditedCommentContentDto,
)

@Serializable
data class EditedCommentContentDto(
    val id: String,
    val content: String,
)

@Serializable
data class CommentDto(
    val id: String,
    val content: String,
    val createdAt: String,
    val author: PostAuthorDto,
    val parentId: String? = null,
    val likeCount: Int = 0,
    val liked: Boolean = false,
    val replies: List<CommentDto> = emptyList(),
)

@Serializable
data class ReadingListsDto(
    val lists: List<ReadingListDto> = emptyList(),
)

@Serializable
data class ReadingListEnvelopeDto(
    val list: ReadingListDto,
)

@Serializable
data class ReadingListDto(
    val id: String,
    val title: String,
    val description: String = "",
    val visibility: String = "private",
    val isReadLater: Boolean = false,
    val itemCount: Int = 0,
    val createdAt: String = "",
    val contains: Boolean? = null,
)

@Serializable
data class LocalProfileDto(
    val user: LocalProfileUserDto,
    val counts: FollowCountsDto,
    val followState: String = "none",
    val isFollowing: Boolean = false,
    val isMuted: Boolean = false,
    val isBlocked: Boolean = false,
    val locked: Boolean = false,
)

@Serializable
data class LocalProfileUserDto(
    val id: String,
    val username: String,
    val displayName: String,
    val bio: String = "",
    val publicEmail: String = "",
    val customSectionHtml: String = "",
    val avatarUrl: String? = null,
    val isPrivate: Boolean = false,
    val createdAt: String = "",
    val tags: List<TagDto> = emptyList(),
    val links: List<ProfileLinkDto> = emptyList(),
)

@Serializable
data class ProfileLinkDto(
    val platform: String,
    val url: String,
    val label: String,
)

@Serializable
data class RemoteProfileDto(
    val user: RemoteProfileUserDto,
    val counts: FollowCountsDto,
    val isFollowing: Boolean = false,
    val isMuted: Boolean = false,
    val isBlocked: Boolean = false,
)

@Serializable
data class RemoteProfileUserDto(
    val id: String,
    val username: String,
    val displayName: String,
    val bio: String = "",
    val avatarUrl: String? = null,
    val host: String,
    val apId: String,
    val tags: List<TagDto> = emptyList(),
)

@Serializable
data class FollowCountsDto(
    val followers: Int = 0,
    val following: Int = 0,
)

@Serializable
data class FollowStateDto(
    val state: String = "following",
)

@Serializable
data class RelationActorsDto(
    val items: List<RelationActorDto> = emptyList(),
)

@Serializable
data class RelationActorDto(
    val id: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String? = null,
    val remote: Boolean = false,
)

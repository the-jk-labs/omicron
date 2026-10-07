package org.omicron.mobile.domain.model

data class Comment(
    val id: String,
    val content: String,
    val createdAt: String,
    val author: PostAuthor,
    val parentId: String?,
    val likeCount: Int,
    val liked: Boolean,
    val replies: List<Comment>,
)

data class CommentPage(
    val items: List<Comment>,
    val nextCursor: String?,
)

data class Profile(
    val user: ProfileUser,
    val followerCount: Int,
    val followingCount: Int,
    val followState: ProfileFollowState,
    val isFollowing: Boolean,
    val isMuted: Boolean,
    val isBlocked: Boolean,
    val locked: Boolean,
    val remote: Boolean,
)

data class ProfileUser(
    val id: String,
    val username: String,
    val displayName: String,
    val bio: String,
    val avatarUrl: String?,
    val createdAt: String,
    val isPrivate: Boolean,
    val tags: List<PostTag>,
    val links: List<ProfileLink>,
    val host: String?,
    val profileUrl: String?,
)

data class ProfileLink(
    val label: String,
    val url: String,
)

data class RelationActor(
    val id: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String?,
    val remote: Boolean,
)

enum class ProfileFollowState {
    None,
    Requested,
    Following,
}

data class LikeState(
    val count: Int,
    val active: Boolean,
)

data class RecommendationState(
    val count: Int,
    val active: Boolean,
)

data class ReadLaterState(
    val listId: String,
    val saved: Boolean,
)

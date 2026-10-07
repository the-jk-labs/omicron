package org.omicron.mobile.domain.model

data class PostAuthor(
    val id: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String?,
    val remote: Boolean,
)

data class PostTag(
    val slug: String,
    val name: String,
)

data class Post(
    val id: String,
    val title: String?,
    val summary: String?,
    val bannerUrl: String?,
    val createdAt: String,
    val author: PostAuthor,
    val tags: List<PostTag>,
    val likeCount: Int,
    val commentCount: Int,
    val recommendCount: Int,
    val remote: Boolean,
    val contentHtml: String = "",
    val liked: Boolean = false,
    val recommended: Boolean = false,
)

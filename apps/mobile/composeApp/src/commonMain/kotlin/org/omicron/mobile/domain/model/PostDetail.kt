package org.omicron.mobile.domain.model

data class CoverCredit(
    val name: String,
    val nameUrl: String,
    val source: String,
    val sourceUrl: String,
    val license: String?,
    val licenseUrl: String?,
)

data class PostDetail(
    val id: String,
    val title: String?,
    val contentHtml: String,
    val coverUrl: String?,
    val coverCredit: CoverCredit?,
    val language: String?,
    val createdAt: String,
    val author: PostAuthor,
    val tags: List<PostTag>,
    val likeCount: Int,
    val commentCount: Int,
    val recommendCount: Int,
    val remote: Boolean,
)

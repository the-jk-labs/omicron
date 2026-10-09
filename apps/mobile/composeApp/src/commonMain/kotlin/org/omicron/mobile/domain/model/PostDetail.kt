package org.omicron.mobile.domain.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
data class CoverCredit(
    val name: String,
    val nameUrl: String,
    val source: String,
    val sourceUrl: String,
    val license: String?,
    val licenseUrl: String?,
)

@Serializable
data class PostDetail(
    val id: String,
    val title: String?,
    val contentHtml: String,
    val coverUrl: String?,
    val coverCredit: CoverCredit?,
    val language: String?,
    val summary: String? = null,
    val status: OwnPostStatus = OwnPostStatus.Published,
    val publishAt: String? = null,
    val createdAt: String,
    val author: PostAuthor,
    val tags: List<PostTag>,
    val likeCount: Int,
    val commentCount: Int,
    val recommendCount: Int,
    val remote: Boolean,
    val liked: Boolean = false,
    val recommended: Boolean = false,
    @Transient val isOfflineCopy: Boolean = false,
    @Transient val cachedAtMillis: Long? = null,
)

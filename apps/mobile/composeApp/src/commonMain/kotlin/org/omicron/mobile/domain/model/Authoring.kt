package org.omicron.mobile.domain.model

enum class OwnPostStatus {
    Draft,
    Scheduled,
    Published,
}

data class OwnPost(
    val id: String,
    val title: String?,
    val slug: String?,
    val status: OwnPostStatus,
    val publishAt: String?,
    val language: String?,
    val summary: String?,
    val coverUrl: String?,
    val createdAt: String,
    val updatedAt: String? = null,
)

data class OwnCounts(
    val draft: Int,
    val scheduled: Int,
    val published: Int,
)

data class CreatePostInput(
    val title: String? = null,
    val contentHtml: String,
    val status: OwnPostStatus? = null,
    val publishAt: String? = null,
    val language: String? = null,
    val summary: String? = null,
    val coverUrl: String? = null,
    val coverCredit: CoverCredit? = null,
    val tags: List<String>? = null,
)

data class UpdatePostInput(
    val title: String? = null,
    val contentHtml: String? = null,
    val status: OwnPostStatus? = null,
    val publishAt: String? = null,
    val language: String? = null,
    val summary: String? = null,
    val coverUrl: String? = null,
    val coverCredit: CoverCredit? = null,
    val tags: List<String>? = null,
)

data class UploadedImage(
    val url: String,
)

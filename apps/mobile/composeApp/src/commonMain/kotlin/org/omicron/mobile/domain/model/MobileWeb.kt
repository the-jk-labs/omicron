package org.omicron.mobile.domain.model

data class ReadingList(
    val id: String,
    val title: String,
    val description: String,
    val visibility: String,
    val isReadLater: Boolean,
    val itemCount: Int,
    val createdAt: String,
)

data class ReadingListDetail(
    val list: ReadingList,
    val isOwner: Boolean,
    val owner: ListOwner,
)

data class ListOwner(
    val username: String,
    val displayName: String,
)

data class WriterDashboard(
    val onInstanceViews: Boolean,
    val totals: DashboardTotals,
    val series: List<DayTotals>,
    val posts: List<PostStat>,
)

data class DashboardTotals(
    val views: Int,
    val likes: Int,
    val comments: Int,
    val followers: Int,
)

data class DayTotals(
    val day: String,
    val views: Int,
)

data class PostStat(
    val postId: String,
    val title: String?,
    val slug: String?,
    val createdAt: String,
    val views: Int,
    val likes: Int,
    val comments: Int,
)

data class MobileNotification(
    val id: String,
    val type: String,
    val actor: PostAuthor?,
    val postId: String?,
    val postTitle: String?,
    val commentSnippet: String?,
    val read: Boolean,
    val createdAt: String,
)

data class CursorPage<T>(
    val items: List<T>,
    val nextCursor: String?,
)

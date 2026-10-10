package org.omicron.mobile.feature.dashboard

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonVariant
import org.omicron.mobile.core.designsystem.rikkaui.icon.Icon
import org.omicron.mobile.core.designsystem.rikkaui.icon.IconSize
import org.omicron.mobile.core.designsystem.rikkaui.icon.RikkaIcons
import org.omicron.mobile.core.designsystem.rikkaui.spinner.Spinner
import org.omicron.mobile.core.designsystem.rikkaui.spinner.SpinnerSize
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.domain.model.PostStat
import org.omicron.mobile.domain.model.WriterDashboard
import org.omicron.mobile.feature.common.MobileFeatureError
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.dashboard_comments
import org.omicron.mobile.resources.dashboard_empty
import org.omicron.mobile.resources.dashboard_engagement
import org.omicron.mobile.resources.dashboard_error_missing_instance
import org.omicron.mobile.resources.dashboard_error_offline
import org.omicron.mobile.resources.dashboard_error_server
import org.omicron.mobile.resources.dashboard_followers
import org.omicron.mobile.resources.dashboard_likes
import org.omicron.mobile.resources.dashboard_likes_comments
import org.omicron.mobile.resources.dashboard_no_view_data
import org.omicron.mobile.resources.dashboard_per_reader_day
import org.omicron.mobile.resources.dashboard_posts
import org.omicron.mobile.resources.dashboard_reach_breakdown
import org.omicron.mobile.resources.dashboard_retry
import org.omicron.mobile.resources.dashboard_subtitle
import org.omicron.mobile.resources.dashboard_title
import org.omicron.mobile.resources.dashboard_views
import org.omicron.mobile.resources.dashboard_views_description
import org.omicron.mobile.resources.dashboard_views_over_time
import org.omicron.mobile.resources.timeline_untitled

@Composable
fun DashboardRoute(
    viewModel: DashboardViewModel,
    onOpenPost: (String) -> Unit,
) {
    val state by viewModel.uiState.collectAsState()
    DashboardScreen(state = state, onRetry = viewModel::retry, onOpenPost = onOpenPost)
}

@Composable
private fun DashboardScreen(
    state: DashboardUiState,
    onRetry: () -> Unit,
    onOpenPost: (String) -> Unit,
) {
    when (state.phase) {
        DashboardPhase.Loading ->
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Spinner(size = SpinnerSize.Lg, label = stringResource(Res.string.dashboard_title))
            }
        DashboardPhase.Error -> DashboardError(state.error ?: MobileFeatureError.Server, onRetry)
        DashboardPhase.Empty ->
            Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
                DashboardHeader()
                Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text(text = stringResource(Res.string.dashboard_empty), variant = TextVariant.P, color = OmicronTheme.colors.mutedForeground)
                }
            }
        DashboardPhase.Content -> {
            val summary = state.summary ?: return
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 20.dp),
            ) {
                item(key = "dashboard-header", contentType = "dashboard-header") { DashboardHeader() }
                item(key = "dashboard-stats", contentType = "dashboard-stats") { SummaryCards(summary) }
                if (!summary.onInstanceViews) {
                    item(key = "dashboard-views-off", contentType = "dashboard-note") {
                        DashboardNote(text = stringResource(Res.string.dashboard_no_view_data), icon = RikkaIcons.Settings)
                    }
                } else if (summary.series.isNotEmpty()) {
                    item(key = "dashboard-chart", contentType = "dashboard-chart") { ViewsChart(summary) }
                }
                item(key = "dashboard-breakdown", contentType = "dashboard-breakdown") { EngagementBreakdown(summary) }
                item(key = "dashboard-posts-title", contentType = "dashboard-posts-title") {
                    Text(text = stringResource(Res.string.dashboard_posts), variant = TextVariant.H3, color = OmicronTheme.colors.foreground)
                }
                items(summary.posts.sortedByDescending { reach(it, summary.onInstanceViews) }, key = PostStat::postId, contentType = { "dashboard-post" }) { post ->
                    DashboardPostRow(post = post, onClick = { onOpenPost(post.postId) })
                }
            }
        }
    }
}

@Composable
private fun DashboardHeader() {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(text = stringResource(Res.string.dashboard_title), variant = TextVariant.H2, color = OmicronTheme.colors.foreground)
        Text(text = stringResource(Res.string.dashboard_subtitle), variant = TextVariant.P, color = OmicronTheme.colors.mutedForeground)
    }
}

@Composable
private fun SummaryCards(summary: WriterDashboard) {
    val metrics = mutableListOf<Metric>()
    if (summary.onInstanceViews) {
        metrics += Metric(
            stringResource(Res.string.dashboard_views),
            summary.totals.views,
            RikkaIcons.Eye,
            stringResource(Res.string.dashboard_per_reader_day),
        )
    }
    metrics += Metric(stringResource(Res.string.dashboard_likes), summary.totals.likes, RikkaIcons.Heart)
    metrics += Metric(stringResource(Res.string.dashboard_comments), summary.totals.comments, RikkaIcons.MessageCircle)
    metrics +=
        Metric(
            stringResource(Res.string.dashboard_engagement),
            summary.totals.likes + summary.totals.comments,
            RikkaIcons.Sparkles,
            stringResource(Res.string.dashboard_likes_comments),
        )
    metrics += Metric(stringResource(Res.string.dashboard_followers), summary.totals.followers, RikkaIcons.Users)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        metrics.chunked(2).forEach { rowMetrics ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                rowMetrics.forEach { metric ->
                    MetricCard(metric, modifier = Modifier.weight(1f))
                }
                if (rowMetrics.size == 1) Spacer(modifier = Modifier.weight(1f))
            }
        }
    }
}

private data class Metric(
    val label: String,
    val value: Int,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val hint: String? = null,
)

@Composable
private fun MetricCard(
    metric: Metric,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier =
            modifier
                .clip(RoundedCornerShape(OmicronTheme.radii.card))
                .background(OmicronTheme.colors.backgroundAlt)
                .border(1.dp, OmicronTheme.colors.borderCard, RoundedCornerShape(OmicronTheme.radii.card))
                .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(imageVector = metric.icon, contentDescription = null, tint = OmicronTheme.colors.mutedForeground, size = IconSize.Sm)
            Text(text = metric.label, variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground)
        }
        Text(text = metric.value.toString(), variant = TextVariant.H2, color = OmicronTheme.colors.foreground, style = androidx.compose.ui.text.TextStyle(fontWeight = FontWeight.Bold))
        metric.hint?.let { Text(text = it, variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground) }
    }
}

@Composable
private fun ViewsChart(summary: WriterDashboard) {
    val peak = summary.series.maxOfOrNull { it.views }?.coerceAtLeast(1) ?: 1
    val gridColor = OmicronTheme.colors.borderCard
    val lineColor = OmicronTheme.colors.foreground
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(OmicronTheme.radii.card))
                .background(OmicronTheme.colors.backgroundAlt)
                .border(1.dp, OmicronTheme.colors.borderCard, RoundedCornerShape(OmicronTheme.radii.card))
                .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(text = stringResource(Res.string.dashboard_views_over_time), variant = TextVariant.H4, color = OmicronTheme.colors.foreground)
        Canvas(
            modifier = Modifier.fillMaxWidth().height(150.dp),
        ) {
            repeat(3) { index ->
                val y = size.height * (index + 1) / 4f
                drawLine(gridColor, androidx.compose.ui.geometry.Offset(0f, y), androidx.compose.ui.geometry.Offset(size.width, y), strokeWidth = 1.dp.toPx())
            }
            if (summary.series.size == 1) {
                val y = size.height - (summary.series.single().views / peak.toFloat()) * size.height
                drawCircle(lineColor, radius = 3.dp.toPx(), center = androidx.compose.ui.geometry.Offset(size.width, y.coerceAtLeast(2.dp.toPx())))
            } else {
                val points = summary.series.mapIndexed { index, day ->
                    val x = index / (summary.series.lastIndex.coerceAtLeast(1)).toFloat() * size.width
                    val y = size.height - day.views / peak.toFloat() * size.height
                    androidx.compose.ui.geometry.Offset(x, y.coerceIn(2.dp.toPx(), size.height - 2.dp.toPx()))
                }
                val path = androidx.compose.ui.graphics.Path().apply {
                    points.forEachIndexed { index, point ->
                        if (index == 0) moveTo(point.x, point.y) else lineTo(point.x, point.y)
                    }
                }
                drawPath(path, lineColor, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 2.dp.toPx()))
                points.lastOrNull()?.let { drawCircle(lineColor, radius = 3.dp.toPx(), center = it) }
            }
        }
        Text(
            text = stringResource(Res.string.dashboard_views_description),
            variant = TextVariant.Small,
            color = OmicronTheme.colors.mutedForeground,
        )
    }
}

@Composable
private fun EngagementBreakdown(summary: WriterDashboard) {
    val views = if (summary.onInstanceViews) summary.totals.views else 0
    val total = views + summary.totals.likes + summary.totals.comments
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(OmicronTheme.radii.card))
                .background(OmicronTheme.colors.backgroundAlt)
                .border(1.dp, OmicronTheme.colors.borderCard, RoundedCornerShape(OmicronTheme.radii.card))
                .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(text = stringResource(Res.string.dashboard_reach_breakdown), variant = TextVariant.H4, color = OmicronTheme.colors.foreground)
        if (summary.onInstanceViews) {
            MetricLine(stringResource(Res.string.dashboard_views), views, total, RikkaIcons.Eye)
        }
        MetricLine(stringResource(Res.string.dashboard_likes), summary.totals.likes, total, RikkaIcons.Heart)
        MetricLine(stringResource(Res.string.dashboard_comments), summary.totals.comments, total, RikkaIcons.MessageCircle)
    }
}

@Composable
private fun MetricLine(
    label: String,
    value: Int,
    total: Int,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Icon(imageVector = icon, contentDescription = null, tint = OmicronTheme.colors.mutedForeground, size = IconSize.Sm)
        Text(text = label, variant = TextVariant.P, color = OmicronTheme.colors.foregroundAlt, modifier = Modifier.weight(1f))
        Text(text = value.toString(), variant = TextVariant.Small, color = OmicronTheme.colors.foreground)
        Text(text = if (total == 0) "0%" else "${value * 100 / total}%", variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground)
    }
}

@Composable
private fun DashboardPostRow(
    post: PostStat,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(OmicronTheme.radii.cardSmall)
    Column(
        modifier = Modifier.fillMaxWidth().clip(shape).clickable(role = Role.Button, onClick = onClick).padding(vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            text = post.title?.ifBlank { null } ?: stringResource(Res.string.timeline_untitled),
            variant = TextVariant.P,
            color = OmicronTheme.colors.foreground,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            style = androidx.compose.ui.text.TextStyle(fontWeight = FontWeight.Medium),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
            if (post.views > 0) DashboardPostCount(RikkaIcons.Eye, post.views)
            DashboardPostCount(RikkaIcons.Heart, post.likes)
            DashboardPostCount(RikkaIcons.MessageCircle, post.comments)
        }
    }
}

@Composable
private fun DashboardPostCount(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    count: Int,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(imageVector = icon, contentDescription = null, tint = OmicronTheme.colors.mutedForeground, size = IconSize.Sm)
        Text(text = count.toString(), variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground)
    }
}

@Composable
private fun DashboardNote(
    text: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
) {
    Row(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(OmicronTheme.radii.card)).background(OmicronTheme.colors.muted).padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = OmicronTheme.colors.foregroundAlt, size = IconSize.Sm)
        Text(text = text, variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground)
    }
}

@Composable
private fun DashboardError(
    error: MobileFeatureError,
    onRetry: () -> Unit,
) {
    val message =
        when (error) {
            MobileFeatureError.Offline -> Res.string.dashboard_error_offline
            MobileFeatureError.Server -> Res.string.dashboard_error_server
            MobileFeatureError.MissingInstance -> Res.string.dashboard_error_missing_instance
        }
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
    ) {
        Text(text = stringResource(message), variant = TextVariant.P, color = OmicronTheme.colors.foregroundAlt)
        Button(text = stringResource(Res.string.dashboard_retry), onClick = onRetry, variant = ButtonVariant.Outline)
    }
}

private fun reach(post: PostStat, viewsEnabled: Boolean) = (if (viewsEnabled) post.views else 0) + post.likes + post.comments

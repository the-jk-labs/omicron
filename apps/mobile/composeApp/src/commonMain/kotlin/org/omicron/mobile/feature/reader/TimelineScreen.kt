package org.omicron.mobile.feature.reader

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import org.jetbrains.compose.resources.painterResource
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.article.PostPreview
import org.omicron.mobile.core.article.postPreview
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonAnimation
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonVariant
import org.omicron.mobile.core.designsystem.rikkaui.button.IconButton
import org.omicron.mobile.core.designsystem.rikkaui.button.IconButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.icon.Icon
import org.omicron.mobile.core.designsystem.rikkaui.icon.IconSize
import org.omicron.mobile.core.designsystem.rikkaui.icon.RikkaIcons
import org.omicron.mobile.core.designsystem.rikkaui.spinner.Spinner
import org.omicron.mobile.core.designsystem.rikkaui.spinner.SpinnerSize
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.data.api.TimelineScope
import org.omicron.mobile.domain.model.Post
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.app_name
import org.omicron.mobile.resources.omicron_logo
import org.omicron.mobile.resources.timeline_change_instance
import org.omicron.mobile.resources.timeline_date_format
import org.omicron.mobile.resources.timeline_empty_description
import org.omicron.mobile.resources.timeline_empty_for_you_description
import org.omicron.mobile.resources.timeline_empty_for_you_title
import org.omicron.mobile.resources.timeline_empty_title
import org.omicron.mobile.resources.timeline_error_missing_instance
import org.omicron.mobile.resources.timeline_error_offline
import org.omicron.mobile.resources.timeline_error_server
import org.omicron.mobile.resources.timeline_load_more
import org.omicron.mobile.resources.timeline_loading
import org.omicron.mobile.resources.timeline_loading_more
import org.omicron.mobile.resources.timeline_month_apr
import org.omicron.mobile.resources.timeline_month_aug
import org.omicron.mobile.resources.timeline_month_dec
import org.omicron.mobile.resources.timeline_month_feb
import org.omicron.mobile.resources.timeline_month_jan
import org.omicron.mobile.resources.timeline_month_jul
import org.omicron.mobile.resources.timeline_month_jun
import org.omicron.mobile.resources.timeline_month_mar
import org.omicron.mobile.resources.timeline_month_may
import org.omicron.mobile.resources.timeline_month_nov
import org.omicron.mobile.resources.timeline_month_oct
import org.omicron.mobile.resources.timeline_month_sep
import org.omicron.mobile.resources.timeline_reading_time
import org.omicron.mobile.resources.timeline_refresh
import org.omicron.mobile.resources.timeline_retry
import org.omicron.mobile.resources.timeline_scope_for_you
import org.omicron.mobile.resources.timeline_scope_global
import org.omicron.mobile.resources.timeline_scope_local
import org.omicron.mobile.resources.timeline_sign_in
import org.omicron.mobile.resources.timeline_untitled
import zed.rainxch.rikkaui.foundation.RikkaTheme

private const val POST_CONTENT_TYPE = "post"

@Composable
fun TimelineRoute(
    viewModel: TimelineViewModel,
    onSignIn: () -> Unit,
    onChangeInstance: () -> Unit,
    onOpenPost: (String) -> Unit,
) {
    val state by viewModel.uiState.collectAsState()
    TimelineScreen(
        state = state,
        onSelectScope = viewModel::selectScope,
        onRefresh = viewModel::refresh,
        onRetry = viewModel::retry,
        onLoadMore = viewModel::loadMore,
        onSignIn = onSignIn,
        onChangeInstance = onChangeInstance,
        onOpenPost = onOpenPost,
    )
}

@Composable
private fun TimelineScreen(
    state: TimelineUiState,
    onSelectScope: (TimelineScope) -> Unit,
    onRefresh: () -> Unit,
    onRetry: () -> Unit,
    onLoadMore: () -> Unit,
    onSignIn: () -> Unit,
    onChangeInstance: () -> Unit,
    onOpenPost: (String) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().background(OmicronTheme.colors.background).safeDrawingPadding(),
    ) {
        TimelineHeader(
            scope = state.scope,
            signedIn = state.signedIn,
            onSelectScope = onSelectScope,
            onSignIn = onSignIn,
            onChangeInstance = onChangeInstance,
        )
        Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
            when (val phase = state.phase) {
                is TimelinePhase.Loading -> TimelineLoading()
                is TimelinePhase.Empty -> TimelineEmpty(scope = state.scope, onRefresh = onRefresh)
                is TimelinePhase.Error ->
                    TimelineError(
                        error = phase.error,
                        onRetry = onRetry,
                        onChangeInstance = onChangeInstance,
                    )
                is TimelinePhase.Content ->
                    TimelineList(
                        state = state,
                        onRefresh = onRefresh,
                        onLoadMore = onLoadMore,
                        onOpenPost = onOpenPost,
                    )
            }
        }
    }
}

@Composable
private fun TimelineHeader(
    scope: TimelineScope,
    signedIn: Boolean,
    onSelectScope: (TimelineScope) -> Unit,
    onSignIn: () -> Unit,
    onChangeInstance: () -> Unit,
) {
    Column(
        modifier = Modifier.widthIn(max = 480.dp).fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Image(
                    painter = painterResource(Res.drawable.omicron_logo),
                    contentDescription = null,
                    modifier = Modifier.size(30.dp),
                )
                Text(
                    text = stringResource(Res.string.app_name),
                    variant = TextVariant.H2,
                    color = OmicronTheme.colors.foreground,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                IconButton(
                    icon = RikkaIcons.Settings,
                    contentDescription = stringResource(Res.string.timeline_change_instance),
                    onClick = onChangeInstance,
                    size = IconButtonSize.Default,
                )
                IconButton(
                    icon = RikkaIcons.User,
                    contentDescription = stringResource(Res.string.timeline_sign_in),
                    onClick = onSignIn,
                    size = IconButtonSize.Default,
                )
            }
        }
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(start = 16.dp, end = 16.dp, top = 30.dp, bottom = 8.dp)
                    .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (signedIn) {
                TimelineScopeTab(
                    label = stringResource(Res.string.timeline_scope_for_you),
                    icon = RikkaIcons.Star,
                    selected = scope == TimelineScope.ForYou,
                    onClick = { onSelectScope(TimelineScope.ForYou) },
                )
            }
            TimelineScopeTab(
                label = stringResource(Res.string.timeline_scope_local),
                icon = RikkaIcons.Users,
                selected = scope == TimelineScope.Local,
                onClick = { onSelectScope(TimelineScope.Local) },
            )
            TimelineScopeTab(
                label = stringResource(Res.string.timeline_scope_global),
                icon = RikkaIcons.Globe,
                selected = scope == TimelineScope.Global,
                onClick = { onSelectScope(TimelineScope.Global) },
            )
        }
    }
}

@Composable
private fun TimelineScopeTab(
    label: String,
    icon: ImageVector,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val tint = if (selected) OmicronTheme.colors.foreground else OmicronTheme.colors.mutedForeground
    Column(
        modifier = Modifier.width(IntrinsicSize.Max),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Button(
            onClick = onClick,
            modifier = Modifier.height(44.dp),
            variant = ButtonVariant.Ghost,
            size = ButtonSize.Sm,
            animation = ButtonAnimation.None,
            label = label,
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(imageVector = icon, contentDescription = null, tint = tint, size = IconSize.Default)
                Text(
                    text = label,
                    variant = TextVariant.P,
                    color = tint,
                    style = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.Medium),
                )
            }
        }
        Spacer(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(if (selected) OmicronTheme.colors.foreground else Color.Transparent),
        )
    }
}

@Composable
private fun TimelineLoading() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Spinner(size = SpinnerSize.Lg, label = stringResource(Res.string.timeline_loading))
    }
}

@Composable
private fun TimelineEmpty(
    scope: TimelineScope,
    onRefresh: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text =
                stringResource(
                    if (scope == TimelineScope.ForYou) {
                        Res.string.timeline_empty_for_you_title
                    } else {
                        Res.string.timeline_empty_title
                    },
                ),
            variant = TextVariant.H3,
        )
        Text(
            text =
                stringResource(
                    if (scope == TimelineScope.ForYou) {
                        Res.string.timeline_empty_for_you_description
                    } else {
                        Res.string.timeline_empty_description
                    },
                ),
            variant = TextVariant.Muted,
        )
        Button(
            text = stringResource(Res.string.timeline_refresh),
            onClick = onRefresh,
            variant = ButtonVariant.Outline,
            size = ButtonSize.Lg,
        )
    }
}

@Composable
private fun TimelineError(
    error: TimelineError,
    onRetry: () -> Unit,
    onChangeInstance: () -> Unit,
) {
    val message =
        when (error) {
            TimelineError.Offline -> stringResource(Res.string.timeline_error_offline)
            TimelineError.Server -> stringResource(Res.string.timeline_error_server)
            TimelineError.MissingInstance -> stringResource(Res.string.timeline_error_missing_instance)
        }
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = message, variant = TextVariant.P)
        if (error == TimelineError.MissingInstance) {
            Button(
                text = stringResource(Res.string.timeline_change_instance),
                onClick = onChangeInstance,
                size = ButtonSize.Lg,
            )
        } else {
            Button(
                text = stringResource(Res.string.timeline_retry),
                onClick = onRetry,
                size = ButtonSize.Lg,
            )
        }
    }
}

@Composable
private fun TimelineList(
    state: TimelineUiState,
    onRefresh: () -> Unit,
    onLoadMore: () -> Unit,
    onOpenPost: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.widthIn(max = 480.dp).fillMaxWidth().fillMaxHeight(),
    ) {
        item(key = "refresh", contentType = "refresh") {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.End,
            ) {
                Button(
                    text = stringResource(Res.string.timeline_refresh),
                    onClick = onRefresh,
                    variant = ButtonVariant.Ghost,
                    size = ButtonSize.Sm,
                )
            }
        }
        items(
            items = state.posts,
            key = { post -> post.id },
            contentType = { POST_CONTENT_TYPE },
        ) { post ->
            PostCard(post = post, onOpen = { onOpenPost(post.id) })
        }
        if (state.nextCursor != null) {
            item(key = "load-more", contentType = "load-more") {
                Box(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    if (state.isLoadingMore) {
                        Spinner(size = SpinnerSize.Sm, label = stringResource(Res.string.timeline_loading_more))
                    } else {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            if (state.loadMoreError != null) {
                                val message =
                                    when (state.loadMoreError) {
                                        TimelineError.Offline -> stringResource(Res.string.timeline_error_offline)
                                        TimelineError.Server -> stringResource(Res.string.timeline_error_server)
                                        TimelineError.MissingInstance ->
                                            stringResource(Res.string.timeline_error_missing_instance)
                                    }
                                Text(text = message, variant = TextVariant.Small)
                            }
                            Button(
                                text = stringResource(Res.string.timeline_load_more),
                                onClick = onLoadMore,
                                variant = ButtonVariant.Outline,
                                size = ButtonSize.Lg,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PostCard(
    post: Post,
    onOpen: () -> Unit,
) {
    val preview = remember(post.summary, post.contentHtml) { postPreview(post.summary, post.contentHtml) }
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(role = Role.Button, onClick = onOpen)
                .padding(horizontal = 16.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AuthorAvatar(post = post)
            Text(
                text = post.author.displayName,
                variant = TextVariant.P,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = OmicronTheme.colors.foreground,
                style = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.Medium),
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = post.title?.ifBlank { null } ?: stringResource(Res.string.timeline_untitled),
                    variant = TextVariant.H3,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                    color = OmicronTheme.colors.foreground,
                    style = TextStyle(fontSize = 24.sp, lineHeight = 30.sp, fontWeight = FontWeight.Bold),
                )
                if (preview.excerpt.isNotBlank()) {
                    Text(
                        text = preview.excerpt,
                        variant = TextVariant.P,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                        color = OmicronTheme.colors.mutedForeground,
                        style = TextStyle(fontSize = 20.sp, lineHeight = 27.sp),
                    )
                }
            }
            if (post.bannerUrl != null) BannerThumbnail(post.bannerUrl)
        }
        if (post.tags.isNotEmpty()) {
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                post.tags.forEach { tag ->
                    Text(
                        text = "#${tag.name}",
                        variant = TextVariant.Small,
                        color = OmicronTheme.colors.foregroundAlt,
                        modifier =
                            Modifier
                                .clip(RikkaTheme.shapes.full)
                                .background(RikkaTheme.colors.muted)
                                .padding(horizontal = 12.dp, vertical = 6.dp),
                    )
                }
            }
        }
        PostMetadata(post = post, preview = preview)
    }
}

@Composable
private fun AuthorAvatar(post: Post) {
    val shape = RikkaTheme.shapes.full
    Box(
        modifier =
            Modifier
                .size(30.dp)
                .clip(shape)
                .background(RikkaTheme.colors.muted)
                .border(1.dp, OmicronTheme.colors.borderCard, shape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = post.author.displayName.trim().firstOrNull()?.uppercase() ?: "?",
            variant = TextVariant.Small,
            color = OmicronTheme.colors.mutedForeground,
        )
        post.author.avatarUrl?.let { avatarUrl ->
            AsyncImage(
                model = avatarUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize().clip(shape),
            )
        }
    }
}

@Composable
private fun BannerThumbnail(url: String) {
    val shape = RikkaTheme.shapes.lg
    AsyncImage(
        model = url,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier =
            Modifier
                .padding(top = 4.dp)
                .size(width = 112.dp, height = 80.dp)
                .clip(shape)
                .border(1.dp, OmicronTheme.colors.borderCard, shape),
    )
}

@Composable
private fun PostMetadata(
    post: Post,
    preview: PostPreview,
) {
    val metadataColor = OmicronTheme.colors.mutedForeground
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = formattedDate(post.createdAt),
            variant = TextVariant.Small,
            color = metadataColor,
            maxLines = 1,
        )
        MetadataItem(
            icon = RikkaIcons.Clock,
            label = stringResource(Res.string.timeline_reading_time, preview.readingMinutes),
            tint = metadataColor,
        )
        MetadataItem(icon = RikkaIcons.Heart, label = post.likeCount.toString(), tint = metadataColor)
        MetadataItem(icon = RikkaIcons.MessageCircle, label = post.commentCount.toString(), tint = metadataColor)
        Spacer(modifier = Modifier.weight(1f))
        MetadataItem(icon = RikkaIcons.Repeat, label = post.recommendCount.toString(), tint = metadataColor)
        Icon(
            imageVector = RikkaIcons.Bookmark,
            contentDescription = null,
            tint = metadataColor,
            size = IconSize.Default,
        )
    }
}

@Composable
private fun MetadataItem(
    icon: ImageVector,
    label: String,
    tint: Color,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = tint, size = IconSize.Sm)
        Text(
            text = label,
            variant = TextVariant.Small,
            color = tint,
            maxLines = 1,
        )
    }
}

@Composable
private fun formattedDate(createdAt: String): String {
    val dateParts = createdAt.take(10).split('-')
    val year = dateParts.getOrNull(0)?.toIntOrNull() ?: return createdAt.take(10)
    val month = dateParts.getOrNull(1)?.toIntOrNull() ?: return createdAt.take(10)
    val day = dateParts.getOrNull(2)?.toIntOrNull() ?: return createdAt.take(10)
    val monthResource = TIMELINE_MONTHS.getOrNull(month - 1) ?: return createdAt.take(10)
    return stringResource(Res.string.timeline_date_format, stringResource(monthResource), day, year)
}

private val TIMELINE_MONTHS =
    listOf(
        Res.string.timeline_month_jan,
        Res.string.timeline_month_feb,
        Res.string.timeline_month_mar,
        Res.string.timeline_month_apr,
        Res.string.timeline_month_may,
        Res.string.timeline_month_jun,
        Res.string.timeline_month_jul,
        Res.string.timeline_month_aug,
        Res.string.timeline_month_sep,
        Res.string.timeline_month_oct,
        Res.string.timeline_month_nov,
        Res.string.timeline_month_dec,
    )

package org.omicron.mobile.feature.discovery

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonVariant
import org.omicron.mobile.core.designsystem.rikkaui.button.IconButton
import org.omicron.mobile.core.designsystem.rikkaui.button.IconButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.icon.RikkaIcons
import org.omicron.mobile.core.designsystem.rikkaui.spinner.Spinner
import org.omicron.mobile.core.designsystem.rikkaui.spinner.SpinnerSize
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.domain.model.DiscoveryTag
import org.omicron.mobile.domain.model.SuggestedPerson
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.discover_articles_many
import org.omicron.mobile.resources.discover_articles_one
import org.omicron.mobile.resources.discover_back
import org.omicron.mobile.resources.discover_empty_description
import org.omicron.mobile.resources.discover_empty_title
import org.omicron.mobile.resources.discover_error_offline
import org.omicron.mobile.resources.discover_error_server
import org.omicron.mobile.resources.discover_followers_many
import org.omicron.mobile.resources.discover_followers_one
import org.omicron.mobile.resources.discover_loading
import org.omicron.mobile.resources.discover_refresh
import org.omicron.mobile.resources.discover_retry
import org.omicron.mobile.resources.discover_search
import org.omicron.mobile.resources.discover_title
import org.omicron.mobile.resources.discover_topics
import org.omicron.mobile.resources.discover_trending
import org.omicron.mobile.resources.discover_who_to_follow
import org.omicron.mobile.resources.timeline_error_missing_instance
import zed.rainxch.rikkaui.foundation.RikkaTheme

@Composable
fun DiscoverRoute(
    viewModel: DiscoverViewModel,
    onBack: () -> Unit,
    onOpenSearch: () -> Unit,
    onOpenPost: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenTag: (String) -> Unit,
) {
    val state by viewModel.uiState.collectAsState()
    DiscoverScreen(
        state = state,
        onBack = onBack,
        onOpenSearch = onOpenSearch,
        onRefresh = viewModel::refresh,
        onRetry = viewModel::retry,
        onOpenPost = onOpenPost,
        onOpenProfile = onOpenProfile,
        onOpenTag = onOpenTag,
    )
}

@Composable
private fun DiscoverScreen(
    state: DiscoverUiState,
    onBack: () -> Unit,
    onOpenSearch: () -> Unit,
    onRefresh: () -> Unit,
    onRetry: () -> Unit,
    onOpenPost: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenTag: (String) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().background(OmicronTheme.colors.background).safeDrawingPadding(),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(
                icon = RikkaIcons.ArrowLeft,
                contentDescription = stringResource(Res.string.discover_back),
                onClick = onBack,
                size = IconButtonSize.Default,
            )
            Text(
                text = stringResource(Res.string.discover_title),
                variant = TextVariant.H2,
                color = OmicronTheme.colors.foreground,
                modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
            )
            IconButton(
                icon = RikkaIcons.Search,
                contentDescription = stringResource(Res.string.discover_search),
                onClick = onOpenSearch,
                size = IconButtonSize.Default,
            )
        }
        Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
            when (val phase = state.phase) {
                is DiscoverPhase.Loading -> DiscoverLoading()
                is DiscoverPhase.Empty ->
                    DiscoverEmpty(onRefresh = onRefresh)
                is DiscoverPhase.Error ->
                    DiscoverError(error = phase.error, onRetry = onRetry)
                is DiscoverPhase.Content ->
                    DiscoverContent(
                        state = state,
                        onRefresh = onRefresh,
                        onOpenPost = onOpenPost,
                        onOpenProfile = onOpenProfile,
                        onOpenTag = onOpenTag,
                    )
            }
        }
    }
}

@Composable
private fun DiscoverLoading() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Spinner(size = SpinnerSize.Lg, label = stringResource(Res.string.discover_loading))
    }
}

@Composable
private fun DiscoverEmpty(onRefresh: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = stringResource(Res.string.discover_empty_title), variant = TextVariant.H3)
        Text(text = stringResource(Res.string.discover_empty_description), variant = TextVariant.Muted)
        Button(
            text = stringResource(Res.string.discover_refresh),
            onClick = onRefresh,
            variant = ButtonVariant.Outline,
            size = ButtonSize.Lg,
        )
    }
}

@Composable
private fun DiscoverError(error: DiscoverError, onRetry: () -> Unit) {
    val message =
        when (error) {
            DiscoverError.Offline -> stringResource(Res.string.discover_error_offline)
            DiscoverError.Server -> stringResource(Res.string.discover_error_server)
            DiscoverError.MissingInstance -> stringResource(Res.string.timeline_error_missing_instance)
        }
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = message, variant = TextVariant.P)
        Button(
            text = stringResource(Res.string.discover_retry),
            onClick = onRetry,
            size = ButtonSize.Lg,
        )
    }
}

@Composable
private fun DiscoverContent(
    state: DiscoverUiState,
    onRefresh: () -> Unit,
    onOpenPost: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenTag: (String) -> Unit,
) {
    val content = state.content
    LazyColumn(
        modifier = Modifier.widthIn(max = 480.dp).fillMaxWidth(),
    ) {
        item(key = "refresh", contentType = DISCOVERY_SECTION_TYPE) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.End,
            ) {
                Button(
                    text = stringResource(Res.string.discover_refresh),
                    onClick = onRefresh,
                    variant = ButtonVariant.Ghost,
                    size = ButtonSize.Sm,
                )
            }
        }
        if (content.trendingPosts.isNotEmpty()) {
            item(key = "trending-header", contentType = DISCOVERY_SECTION_TYPE) {
                DiscoverSectionHeader(title = stringResource(Res.string.discover_trending))
            }
            items(
                items = content.trendingPosts,
                key = { post -> "trending-${post.id}" },
                contentType = { DISCOVERY_POST_TYPE },
            ) { post ->
                DiscoveryPostRow(post = post, onOpen = { onOpenPost(post.id) })
            }
        }
        if (content.topics.isNotEmpty()) {
            item(key = "topics-header", contentType = DISCOVERY_SECTION_TYPE) {
                DiscoverSectionHeader(title = stringResource(Res.string.discover_topics))
            }
            item(key = "topics-list", contentType = DISCOVERY_SECTION_TYPE) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    content.topics.forEach { tag ->
                        TopicRow(tag = tag, onOpen = { onOpenTag(tag.slug) })
                    }
                }
            }
        }
        if (content.suggestedPeople.isNotEmpty()) {
            item(key = "people-header", contentType = DISCOVERY_SECTION_TYPE) {
                DiscoverSectionHeader(title = stringResource(Res.string.discover_who_to_follow))
            }
            items(
                items = content.suggestedPeople,
                key = { person -> "person-${person.id}" },
                contentType = { DISCOVERY_PERSON_TYPE },
            ) { person ->
                SuggestedPersonRow(person = person, onOpen = { onOpenProfile(person.username) })
            }
        }
    }
}

@Composable
private fun DiscoverSectionHeader(title: String) {
    Text(
        text = title,
        variant = TextVariant.H3,
        color = OmicronTheme.colors.foreground,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
    )
}

@Composable
private fun TopicRow(tag: DiscoveryTag, onOpen: () -> Unit) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RikkaTheme.shapes.lg)
                .clickable(role = Role.Button, onClick = onOpen)
                .padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "#${tag.name}",
            variant = TextVariant.P,
            color = OmicronTheme.colors.foreground,
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text =
                if (tag.postCount == 1) {
                    stringResource(Res.string.discover_articles_one)
                } else {
                    stringResource(Res.string.discover_articles_many, tag.postCount)
                },
            variant = TextVariant.Small,
            color = OmicronTheme.colors.mutedForeground,
        )
    }
}

@Composable
private fun SuggestedPersonRow(person: SuggestedPerson, onOpen: () -> Unit) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(role = Role.Button, onClick = onOpen)
                .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DiscoveryAvatar(displayName = person.displayName, avatarUrl = person.avatarUrl)
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = person.displayName,
                variant = TextVariant.P,
                color = OmicronTheme.colors.foreground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text =
                    if (person.followerCount == 1) {
                        stringResource(Res.string.discover_followers_one)
                    } else {
                        stringResource(Res.string.discover_followers_many, person.followerCount)
                    },
                variant = TextVariant.Small,
                color = OmicronTheme.colors.mutedForeground,
            )
        }
    }
}

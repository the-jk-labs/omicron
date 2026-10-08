package org.omicron.mobile.domain.model

data class DiscoveryTag(
    val slug: String,
    val name: String,
    val postCount: Int,
)

data class DiscoveryPerson(
    val id: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String?,
    val remote: Boolean,
)

data class SuggestedPerson(
    val id: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String?,
    val remote: Boolean,
    val followerCount: Int,
)

data class TagDetail(
    val slug: String,
    val name: String,
    val postCount: Int,
    val followerCount: Int,
    val isFollowing: Boolean,
)

data class SearchResults(
    val posts: List<Post>,
    val people: List<DiscoveryPerson>,
    val tags: List<DiscoveryTag>,
)

data class DiscoverContent(
    val trendingPosts: List<Post>,
    val suggestedPeople: List<SuggestedPerson>,
    val topics: List<DiscoveryTag>,
)

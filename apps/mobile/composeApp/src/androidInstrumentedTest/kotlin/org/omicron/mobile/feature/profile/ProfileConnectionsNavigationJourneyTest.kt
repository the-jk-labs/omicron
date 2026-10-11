package org.omicron.mobile.feature.profile

import androidx.activity.ComponentActivity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.HttpHeaders
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.omicron.mobile.OmicronApp
import org.omicron.mobile.core.storage.AppearancePreferenceStore
import org.omicron.mobile.core.storage.InstanceStore
import org.omicron.mobile.core.storage.SessionCookieStore
import org.omicron.mobile.core.storage.StoredSessionCookie
import org.omicron.mobile.data.api.FollowCountsDto
import org.omicron.mobile.data.api.KtorAuthoringApi
import org.omicron.mobile.data.api.KtorAuthApi
import org.omicron.mobile.data.api.KtorDiscoveryApi
import org.omicron.mobile.data.api.KtorInstanceApi
import org.omicron.mobile.data.api.KtorMobileWebApi
import org.omicron.mobile.data.api.KtorPostsApi
import org.omicron.mobile.data.api.KtorSocialApi
import org.omicron.mobile.data.api.LocalProfileDto
import org.omicron.mobile.data.api.LocalProfileUserDto
import org.omicron.mobile.data.api.PostAuthorDto
import org.omicron.mobile.data.api.PostDto
import org.omicron.mobile.data.api.RelationActorDto
import org.omicron.mobile.data.api.RelationActorsDto
import org.omicron.mobile.data.api.TimelinePageDto
import org.omicron.mobile.data.repository.AuthoringRepository
import org.omicron.mobile.data.repository.AuthRepository
import org.omicron.mobile.data.repository.DiscoveryRepository
import org.omicron.mobile.data.repository.InstanceRepository
import org.omicron.mobile.data.repository.MobileWebRepository
import org.omicron.mobile.data.repository.PostsRepository
import org.omicron.mobile.data.repository.SocialRepository
import org.omicron.mobile.domain.model.AppearancePreference
import org.omicron.mobile.domain.model.InstanceConfiguration

@RunWith(AndroidJUnit4::class)
class ProfileConnectionsNavigationJourneyTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private var client: HttpClient? = null

    @After
    fun closeClient() {
        client?.close()
    }

    @Test
    fun profileCountsOpenSeparateListsAndMemberBackRestoresTheSelectedTab() {
        showApp()
        waitForText("Connected to Omicron")
        rule.onNodeWithContentDescription("Continue").performClick()
        waitForText("Ada Lovelace")
        rule.onNodeWithText("Ada Lovelace").performClick()
        waitForText("Sign in to follow")

        rule.onNode(hasText("Followers") and SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Tab)).assertDoesNotExist()
        count("Followers").performScrollTo().performClick()
        waitForText("16 followers")
        rule.onNodeWithText("16 followers").assertIsSelected()
        waitForText("@grace")

        rule.onNodeWithText("24 following").performClick().assertIsSelected()
        waitForText("@alan")
        rule.onNodeWithText("@alan").performClick()
        waitForText("Alan Turing")
        rule.activityRule.scenario.onActivity { it.onBackPressedDispatcher.onBackPressed() }
        waitForText("24 following")
        rule.onNodeWithText("24 following").assertIsSelected()
        waitForText("@alan")
        rule.onNodeWithContentDescription("Back to profile").performClick()
        waitForText("Sign in to follow")

        count("Following").performScrollTo().performClick()
        waitForText("24 following")
        rule.onNodeWithText("24 following").assertIsSelected()
        waitForText("@alan")
    }

    private fun count(label: String) = rule.onNode(hasText(label) and hasClickAction() and SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))

    private fun waitForText(text: String) {
        rule.waitUntil(10_000) { rule.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText(text).assertIsDisplayed()
    }

    private fun showApp() {
        val json = Json { ignoreUnknownKeys = true }
        val engine = MockEngine { request ->
            val path = request.url.encodedPath
            val response = when {
                path == "/api/posts" -> json.encodeToString(TimelinePageDto(items = listOf(PostDto("post", "An article", createdAt = "2026-01-01T00:00:00Z", author = PostAuthorDto("ada", "ada", "Ada Lovelace")))))
                path.endsWith("/posts") || path.endsWith("/recommendations") -> json.encodeToString(TimelinePageDto())
                path.endsWith("/followers") -> json.encodeToString(RelationActorsDto(listOf(RelationActorDto("grace", "grace", "Grace Hopper"))))
                path.endsWith("/following") -> json.encodeToString(RelationActorsDto(listOf(RelationActorDto("alan", "alan", "Alan Turing"))))
                path.startsWith("/api/users/") -> {
                    val username = path.substringAfterLast('/')
                    json.encodeToString(LocalProfileDto(LocalProfileUserDto(username, username, if (username == "ada") "Ada Lovelace" else "Alan Turing"), FollowCountsDto(16, 24)))
                }
                else -> error("Unexpected API request: $path")
            }
            respond(response, headers = headersOf(HttpHeaders.ContentType, "application/json"))
        }
        val httpClient = HttpClient(engine) {
            expectSuccess = true
            install(ContentNegotiation) { json(json) }
        }
        client = httpClient
        val instanceStore = object : InstanceStore {
            override suspend fun read() = InstanceConfiguration("https://omicron.blog", "Omicron", "omicron.blog", true, true, true, true)
            override suspend fun write(configuration: InstanceConfiguration) = Unit
        }
        val cookieStore = object : SessionCookieStore {
            override suspend fun read(origin: String) = emptyList<StoredSessionCookie>()
            override suspend fun write(origin: String, cookies: List<StoredSessionCookie>) = Unit
        }
        val appearanceStore = object : AppearancePreferenceStore {
            override suspend fun read() = AppearancePreference.Dark
            override suspend fun write(preference: AppearancePreference) = Unit
        }
        val instanceRepository = InstanceRepository(KtorInstanceApi(httpClient), instanceStore)
        val authRepository = AuthRepository(KtorAuthApi(httpClient), cookieStore)
        val postsRepository = PostsRepository(KtorPostsApi(httpClient), instanceRepository::savedInstance)
        val socialRepository = SocialRepository(KtorSocialApi(httpClient), instanceRepository::savedInstance)
        val discoveryRepository = DiscoveryRepository(KtorDiscoveryApi(httpClient), instanceRepository::savedInstance)
        val authoringRepository = AuthoringRepository(KtorAuthoringApi(httpClient), instanceRepository::savedInstance)
        val mobileWebRepository = MobileWebRepository(KtorMobileWebApi(httpClient), instanceRepository::savedInstance, accessToken = { null })
        rule.setContent {
            OmicronApp(instanceRepository, authRepository, postsRepository, socialRepository, discoveryRepository, authoringRepository, mobileWebRepository, appearanceStore)
        }
    }
}

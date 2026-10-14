package org.omicron.mobile.feature.auth

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.cookies.HttpCookies
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.CompletableDeferred
import kotlinx.serialization.json.Json
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.omicron.mobile.OmicronApp
import org.omicron.mobile.core.network.OriginCookiesStorage
import org.omicron.mobile.core.storage.AppearancePreferenceStore
import org.omicron.mobile.core.storage.InstanceStore
import org.omicron.mobile.core.storage.SessionCookieStore
import org.omicron.mobile.core.storage.StoredSessionCookie
import org.omicron.mobile.data.api.KtorAuthoringApi
import org.omicron.mobile.data.api.KtorAuthApi
import org.omicron.mobile.data.api.KtorDiscoveryApi
import org.omicron.mobile.data.api.KtorInstanceApi
import org.omicron.mobile.data.api.KtorMobileWebApi
import org.omicron.mobile.data.api.KtorPostsApi
import org.omicron.mobile.data.api.KtorSocialApi
import org.omicron.mobile.data.repository.AuthoringRepository
import org.omicron.mobile.data.repository.AuthRepository
import org.omicron.mobile.data.repository.DiscoveryRepository
import org.omicron.mobile.data.repository.InstanceRepository
import org.omicron.mobile.data.repository.MobileWebRepository
import org.omicron.mobile.data.repository.PostsRepository
import org.omicron.mobile.data.repository.SocialRepository
import org.omicron.mobile.domain.model.AppearancePreference
import org.omicron.mobile.domain.model.InstanceConfiguration

class StartupSessionJourneyTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private var client: HttpClient? = null
    private val feedRequests = AtomicInteger()

    @After
    fun closeClient() {
        client?.close()
    }

    @Test
    fun reopeningWithASavedCookieRestoresTheSessionBeforeOpeningHome() {
        val auth = showApp()

        rule.waitUntil(10_000) {
            rule.onAllNodesWithText("Connected to Omicron").fetchSemanticsNodes().isNotEmpty() ||
                rule.onAllNodesWithText("For you").fetchSemanticsNodes().isNotEmpty()
        }
        rule.onNodeWithText("For you").assertIsDisplayed()
        rule.onNodeWithText("Sign in").assertDoesNotExist()
        rule.onNodeWithText("Connected to Omicron").assertDoesNotExist()
        rule.onNodeWithText("Session restored").assertDoesNotExist()
        assertEquals("ada", auth.currentSession()?.user?.username)
    }

    @Test
    fun returningGuestsOpenHomeWithoutAnAuthenticationRequest() {
        showApp(savedCookie = false)

        waitForText("Sign in")
        rule.onNodeWithText("Global").assertIsDisplayed()
        rule.onNodeWithText("Connected to Omicron").assertDoesNotExist()
        rule.onNodeWithContentDescription("Settings").performClick()
        waitForText("Change instance")
        rule.onNodeWithContentDescription("Change instance").performClick()
        waitForText("Connected to Omicron")
    }

    @Test
    fun firstLaunchStillRequiresAnInstanceConnection() {
        showApp(savedInstance = false, savedCookie = false)

        waitForText("Choose an instance")
        rule.onNodeWithText("Sign in").assertDoesNotExist()
    }

    @Test
    fun anUnavailableSessionCanBeRetriedWithoutShowingSignedOutNavigation() {
        val offline = AtomicBoolean(true)
        val auth = showApp(offline = offline)

        waitForText("Could not restore your session. Check your connection and try again.")
        rule.onNodeWithText("Sign in").assertDoesNotExist()
        offline.set(false)
        rule.onNodeWithContentDescription("Try again").performClick()
        waitForText("For you")
        assertEquals("ada", auth.currentSession()?.user?.username)
    }

    @Test
    fun anInvalidSavedSessionOpensGuestHome() {
        val auth = showApp(sessionExists = false)

        waitForText("Sign in")
        rule.onNodeWithText("Global").assertIsDisplayed()
        assertNull(auth.currentSession())
    }

    @Test
    fun navigationAndFeedRequestsWaitUntilRestorationCompletes() {
        val sessionGate = CompletableDeferred<Unit>()
        showApp(sessionGate = sessionGate)

        waitForText("Restoring session")
        rule.onNodeWithText("Sign in").assertDoesNotExist()
        rule.onNodeWithText("Connected to Omicron").assertDoesNotExist()
        assertEquals(0, feedRequests.get())
        sessionGate.complete(Unit)
        waitForText("For you")
    }

    @Test
    fun explicitGuestReadingRetainsTheSessionForLaterRestoration() {
        val offline = AtomicBoolean(true)
        val auth = showApp(offline = offline)

        waitForText("Could not restore your session. Check your connection and try again.")
        rule.onNodeWithContentDescription("Continue as guest").performClick()
        waitForText("Sign in")
        offline.set(false)
        rule.onNodeWithContentDescription("Sign in").performClick()
        waitForText("Session restored")
        assertEquals("ada", auth.currentSession()?.user?.username)
    }

    @Test
    fun aRevokedSessionThatCannotMintATokenOpensGuestHome() {
        val auth = showApp(tokenUnauthorized = true)

        waitForText("Global")
        rule.onAllNodesWithText("Sign in")[0].assertIsDisplayed()
        assertNull(auth.currentSession())
    }

    private fun waitForText(text: String) {
        rule.waitUntil(10_000) { rule.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText(text).assertIsDisplayed()
    }

    private fun showApp(
        savedInstance: Boolean = true,
        savedCookie: Boolean = true,
        sessionExists: Boolean = true,
        offline: AtomicBoolean = AtomicBoolean(false),
        sessionGate: CompletableDeferred<Unit>? = null,
        tokenUnauthorized: Boolean = false,
    ): AuthRepository {
        val origin = "https://omicron.blog"
        val cookieStore = object : SessionCookieStore {
            private var cookies = if (savedCookie) listOf(StoredSessionCookie("omicron.session_token", "saved-session", null)) else emptyList()
            override suspend fun read(origin: String) = cookies
            override suspend fun write(origin: String, cookies: List<StoredSessionCookie>) {
                this.cookies = cookies
            }
        }
        val engine = MockEngine { request ->
            assertEquals("omicron.blog", request.url.host)
            if (request.url.encodedPath == "/api/auth/get-session" && offline.get()) {
                return@MockEngine respond("{}", HttpStatusCode.ServiceUnavailable, headersOf(HttpHeaders.ContentType, "application/json"))
            }
            if (request.url.encodedPath == "/api/auth/token" && tokenUnauthorized) {
                return@MockEngine respond("""{"code":"UNAUTHORIZED"}""", HttpStatusCode.Unauthorized, headersOf(HttpHeaders.ContentType, "application/json"))
            }
            val body = when (request.url.encodedPath) {
                "/api/auth/get-session" -> {
                    sessionGate?.await()
                    check(savedCookie)
                    assertEquals("omicron.session_token=saved-session", request.headers[HttpHeaders.Cookie])
                    if (sessionExists) """{"user":{"id":"ada","email":"ada@example.com","username":"ada","name":"Ada"},"session":{}}""" else "null"
                }
                "/api/auth/token" -> {
                    assertEquals("omicron.session_token=saved-session", request.headers[HttpHeaders.Cookie])
                    """{"token":"fresh-token"}"""
                }
                "/api/feed" -> {
                    feedRequests.incrementAndGet()
                    assertEquals("Bearer fresh-token", request.headers[HttpHeaders.Authorization])
                    """{"items":[],"nextCursor":null}"""
                }
                "/api/posts" -> {
                    feedRequests.incrementAndGet()
                    """{"items":[],"nextCursor":null}"""
                }
                "/api/notifications/unread-count" -> """{"count":0}"""
                else -> error("Unexpected API request: ${request.url.encodedPath}")
            }
            respond(body, headers = headersOf(HttpHeaders.ContentType, "application/json"))
        }
        val httpClient = HttpClient(engine) {
            expectSuccess = true
            install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
            install(HttpCookies) { storage = OriginCookiesStorage(cookieStore) }
        }
        client = httpClient
        val instanceStore = object : InstanceStore {
            override suspend fun read() = if (savedInstance) InstanceConfiguration(origin, "Omicron", "omicron.blog", true, true, true, true) else null
            override suspend fun write(configuration: InstanceConfiguration) = Unit
        }
        val appearanceStore = object : AppearancePreferenceStore {
            override suspend fun read() = AppearancePreference.Dark
            override suspend fun write(preference: AppearancePreference) = Unit
        }
        val instances = InstanceRepository(KtorInstanceApi(httpClient), instanceStore)
        val auth = AuthRepository(KtorAuthApi(httpClient), cookieStore)
        assertNull(auth.currentSession())
        val posts = PostsRepository(KtorPostsApi(httpClient), instances::savedInstance, auth::accessToken)
        val social = SocialRepository(KtorSocialApi(httpClient), instances::savedInstance, auth::accessToken)
        val discovery = DiscoveryRepository(KtorDiscoveryApi(httpClient), instances::savedInstance, auth::accessToken)
        val authoring = AuthoringRepository(KtorAuthoringApi(httpClient), instances::savedInstance, auth::accessToken)
        val mobileWeb = MobileWebRepository(KtorMobileWebApi(httpClient), instances::savedInstance, auth::accessToken)
        rule.setContent { OmicronApp(instances, auth, posts, social, discovery, authoring, mobileWeb, appearanceStore) }
        return auth
    }
}

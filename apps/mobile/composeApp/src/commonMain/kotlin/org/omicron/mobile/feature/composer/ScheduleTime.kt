package org.omicron.mobile.feature.composer

import kotlinx.datetime.DatePeriod
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.number
import kotlinx.datetime.plus
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.todayIn
import kotlin.time.Clock
import kotlin.time.Duration.Companion.hours
import kotlin.time.Instant

const val MIN_SCHEDULE_LEAD_MILLIS = 60_000L

fun schedulePresets(clock: Clock, zone: TimeZone): List<Instant> {
    val tomorrow = clock.todayIn(zone) + DatePeriod(days = 1)
    val tomorrowNine = LocalDateTime(tomorrow, LocalTime(9, 0)).toInstant(zone)
    var monday = tomorrow
    while (monday.dayOfWeek != DayOfWeek.MONDAY) monday += DatePeriod(days = 1)
    return listOf(clock.now() + 1.hours, tomorrowNine, LocalDateTime(monday, LocalTime(9, 0)).toInstant(zone))
}

fun parseScheduleInput(date: String, time: String, zone: TimeZone): Instant? {
    val localDate = runCatching { LocalDate.parse(date) }.getOrNull() ?: return null
    val localTime = runCatching { LocalTime.parse(time) }.getOrNull() ?: return null
    return runCatching { LocalDateTime(localDate, localTime).toInstant(zone) }.getOrNull()
}

fun Instant.isSchedulable(clock: Clock): Boolean =
    toEpochMilliseconds() - clock.now().toEpochMilliseconds() >= MIN_SCHEDULE_LEAD_MILLIS

fun Instant.toScheduleInput(zone: TimeZone): Pair<String, String> {
    val local = toLocalDateTime(zone)
    return local.date.toString() to "${local.hour.padded()}:${local.minute.padded()}"
}

fun formatScheduledFor(iso: String, zone: TimeZone): String? {
    val instant = runCatching { Instant.parse(iso) }.getOrNull() ?: return null
    val local = instant.toLocalDateTime(zone)
    return "${local.day} ${MONTHS[local.month.number - 1]} ${local.year}, " +
        "${local.hour.padded()}:${local.minute.padded()} · ${zone.id}"
}

private fun Int.padded(): String = toString().padStart(2, '0')

private val MONTHS =
    listOf(
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    )

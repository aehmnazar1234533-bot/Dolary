package com.dolary.app

data class RateChange(val province: String, val oldRate: Int, val newRate: Int)

object RateAlertEvaluator {
    const val MIN_MOVEMENT_IQD = 25

    fun evaluate(
        oldRates: Map<String, Int>,
        newRates: Map<String, Int>,
        targetProvinces: List<String>,
        targetEnabled: Boolean,
        targetProvince: String,
        targetRate: Int,
        targetDirection: String,
        lastAlertTimes: Map<String, Long>,
        nowMillis: Long,
        cooldownMillis: Long
    ): List<RateChange> {
        if (oldRates.isEmpty() || newRates.isEmpty()) return emptyList()
        return targetProvinces.distinct().mapNotNull { province ->
            val oldRate = oldRates[province] ?: return@mapNotNull null
            val newRate = newRates[province] ?: return@mapNotNull null
            val crossedTarget = targetEnabled && province == targetProvince && targetRate > 0 &&
                if (targetDirection == "below") oldRate > targetRate && newRate <= targetRate
                else oldRate < targetRate && newRate >= targetRate
            val delta = newRate - oldRate
            val lastAlert = lastAlertTimes[province] ?: 0L
            if (crossedTarget) RateChange(province, oldRate, newRate)
            else if (kotlin.math.abs(delta) < MIN_MOVEMENT_IQD ||
                (lastAlert > 0L && nowMillis - lastAlert < cooldownMillis)
            ) null
            else RateChange(province, oldRate, newRate)
        }
    }
}

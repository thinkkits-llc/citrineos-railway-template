#!/bin/sh
# EVerest OCPP charge point simulator startup
# Connects to CitrineOS Core via internal networking

_OCPP_VERSION=${OCPP_VERSION:-2.0.1}
OCPP_VERSION_ENUM="OCPP201"
EVEREST_TARGET_URL="${CITRINEOS_WS_URL:-ws://citrineos-core.railway.internal:8081/cp001}"

case "$_OCPP_VERSION" in
  "1.6")
    OCPP_VERSION_ENUM="OCPP16"
    ;;
  "2.0.1")
    OCPP_VERSION_ENUM="OCPP201"
    ;;
  "2.1")
    OCPP_VERSION_ENUM="OCPP21"
    ;;
  *)
    _OCPP_VERSION="2.0.1"
    OCPP_VERSION_ENUM="OCPP201"
    ;;
esac

echo "Starting EVerest with OCPP ${_OCPP_VERSION} (${OCPP_VERSION_ENUM})"
echo "Target CSMS: ${EVEREST_TARGET_URL}"

if [ "$_OCPP_VERSION" != "1.6" ]; then
    CONFIG="$(cat <<JSON
[{"configurationSlot": 1, "connectionData": {"messageTimeout": 30, "ocppCsmsUrl": "$EVEREST_TARGET_URL", "ocppInterface": "Wired0", "ocppTransport": "JSON", "ocppVersion": "$OCPP_VERSION_ENUM", "securityProfile": 1}}, {"configurationSlot": 2, "connectionData": {"messageTimeout": 30, "ocppCsmsUrl": "$EVEREST_TARGET_URL", "ocppInterface": "Wired0", "ocppTransport": "JSON", "ocppVersion": "$OCPP_VERSION_ENUM", "securityProfile": 2}}]
JSON
 )"

    if [ -f /tmp/config.json ]; then
        chmod +x /tmp/config.json
        jq --argjson config "$CONFIG" '
        (.[]
            | select(.name == "InternalCtrlr")
            | .variables.NetworkConnectionProfiles.attributes.Actual
        ) = $config
        ' "/tmp/config.json" > /tmp/config_citrine.json && mv /tmp/config_citrine.json "/tmp/config.json"
        chmod -x /tmp/config.json
    fi

    INTERNAL_CTRL="/ext/dist/share/everest/modules/OCPP201/component_config/standardized/InternalCtrlr.json"
    if [ -f "$INTERNAL_CTRL" ]; then
        chmod +x "$INTERNAL_CTRL"
        jq --argjson config "$CONFIG" '
        (.
            | .properties
            | .NetworkConnectionProfiles
            | .attributes[]
            | select(.type == "Actual")
            | .value
        ) = $config
        ' "$INTERNAL_CTRL" > /tmp/config_citrine_dist.json && mv /tmp/config_citrine_dist.json "$INTERNAL_CTRL"
        chmod -x "$INTERNAL_CTRL"
    fi
fi

/entrypoint.sh
http-server /tmp/everest_ocpp_logs -p 8888 &

if [ "$_OCPP_VERSION" = "1.6" ]; then
    chmod +x /ext/build/run-scripts/run-sil-ocpp.sh
    sed -i "0,/127.0.0.1:8180\/steve\/websocket\/CentralSystemService\// s|127.0.0.1:8180/steve/websocket/CentralSystemService/|${EVEREST_TARGET_URL}|" /ext/dist/share/everest/modules/OCPP/config-docker.json
    /ext/build/run-scripts/run-sil-ocpp.sh
else
    rm -f /ext/dist/share/everest/modules/OCPP201/component_config/custom/EVSE_2.json
    rm -f /ext/dist/share/everest/modules/OCPP201/component_config/custom/Connector_2_1.json
    chmod +x /ext/build/run-scripts/run-sil-ocpp201-pnc.sh
    /ext/build/run-scripts/run-sil-ocpp201-pnc.sh
fi

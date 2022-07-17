
# homebridge-prosegur

This is a [Homebridge](https://github.com/homebridge/homebridge) for Prosegur alarms users that allow homeowners to control their security system. The plugin currently supports Prosegur alarms in Colombia, Portugal and Spain.

To use this plugin, here are three simple steps you need to follow:
1. Run `npm install homebridge-prosegur`
2. Configure the plugin using the [configuration example](#configuration)
3. Restart Homebridge

You can also search `prosegur` using [HOOBS](https://github.com/mkellsy/homebridge-config-ui) or [Onzu's Homebridge Config UI](https://github.com/oznu/homebridge-config-ui-x). Then proceed to configure the plugin using the included settings in the plugin page.

## Configuration
When configuring this plugin, simply add the platform to your existing `config.json` file. Mind that the `platform` name must always be `Prosegur`.
```json
{
  "platforms": [
    {
      "platform": "Prosegur",
      "name": "Alarm Name",
      "username": "email@email.com",
      "password": "1234567890",
      "country": "CO",
    },
    {
      "platform": "...",
      "name": "..."
    }
  ]
}
```
## Notes
This project has no relationship with Prosegur (unofficial library).
The component uses the API provided by the Web Application.
Has only been tested in Colombia, but should also work in Spain and Portugal.
## Credits and Appreciation
Based on the [pyprosegur](https://github.com/dgomes/pyprosegur) library by [@dgomes](https://github.com/dgomes)
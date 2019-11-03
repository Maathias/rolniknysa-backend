# rolniknysa-backend
## config.json:
```json
{
	"port": 8008,
	"articleDescriptionLimit": 150,
	"root": "../rolniknysa/docs/",
	"db": {
		"hostname": "<db hostname>",
		"name": "rolniknysa"
	},
	"hubhooks": {
		"secret": "<github webhooks secret>"
	}
}
```

## logging:
```javascript
logger.log({
	data: "Data to log in console",
	action: 'info'
}))
```
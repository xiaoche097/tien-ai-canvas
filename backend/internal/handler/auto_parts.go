package handler

import (
	"github.com/gin-gonic/gin"
	"yingce/backend/internal/service"
)

func RegisterAutoPartsRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/auto-parts/vehicles", func(c *gin.Context) {
		if _, err := currentUser(c, svc); err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"vehicles": svc.AutoPartsVehicles()})
	})
}

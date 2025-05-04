import React from 'react'
import { Grid, Box, Typography } from '@mui/material'
import ImageCard from './ImageCard'

const ImageGallery = ({ images, toggleFavorite, newImageId }) => {
  return (
    <Box
      sx={{
        height: 'calc(100vh - 120px)', // Adjust height to fit within viewport
        overflow: 'auto',
        pr: 1, // Add padding for scrollbar
        // Custom scrollbar styling
        '&::-webkit-scrollbar': {
          width: '8px',
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent',
        },
        '&::-webkit-scrollbar-thumb': {
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '4px',
          '&:hover': {
            background: 'rgba(0, 0, 0, 0.3)',
          },
        },
        // Firefox scrollbar styling
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(0, 0, 0, 0.2) transparent',
      }}
    >
      {images.length === 0 ? (
        <Box 
          sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '50vh',
            flexDirection: 'column',
            textAlign: 'center',
            p: 3
          }}
        >
          <Typography variant="h6" gutterBottom>No images generated yet</Typography>
          <Typography variant="body2" color="text.secondary">
            Use the sidebar to generate your first image
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={3}>
          {images.map(image => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={image.id}>
              <ImageCard 
                image={image} 
                toggleFavorite={toggleFavorite} 
                isNew={image.id === newImageId}
              />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  )
}

export default ImageGallery
